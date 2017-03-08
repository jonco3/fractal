/*-*- Mode: JS; tab-width: 4 -*-*/

let plotterCanvas = null;
let plotterStartCallback;
let plotterEndCallback;

let idleWorkers = [];
let busyWorkers = [];

let plotterPhase;
let startTime;
let totalPixels;

let regionQueue = [];

let plotterStats;

function initPlotter()
{
    createWorkers();
}

function error(message)
{
    alert(message);
    throw message;
}

function createWorkers()
{
    if (!window.Worker)
        error("Requires workers -- please upgrade your browser");

    assert(busyWorkers.length == 0,
           "createWorkers expects no workers to be running");

    assert(typeof params.threads === 'number', "Bad thread count parameter");

    while (idleWorkers.length > params.threads) {
        idleWorkers.pop().terminate();
    }

    for (let i = idleWorkers.length; i < params.threads; i++) {
        worker = new Worker("worker.js");
        if (!worker)
            error("Failed to create worker");
        worker.onmessage = processMessageFromWorker;
        idleWorkers.push(worker);
    }

    var testBuffer = new ArrayBuffer(1);
    idleWorkers[0].postMessage(["test", testBuffer], [testBuffer]);
    if (testBuffer.byteLength)
        error("Requires Transferables -- please upgrade your browser");
}

function noteWorkerIdle(worker)
{
    let i = busyWorkers.indexOf(worker);
    assert(i !== -1, "Worker not running");
    busyWorkers.splice(i, 1);
    idleWorkers.push(worker);
}

function getIdleWorker()
{
    assert(idleWorkers.length > 0, "All workers already running");
    let worker = idleWorkers.pop();
    busyWorkers.push(worker);
    return worker;
}

function processMessageFromWorker(event)
{
    switch(event.data[0]) {
    case "error":
        error(event.data[1]);
        break;
    case "plotRegionFinished":
        noteWorkerIdle(this);
        assert(event.data.length === 5, "Bad response from plotRegion");
        let [, region, buffer, pixels, stats] = event.data;
        plotRegionFinished(region, buffer, pixels, stats);
        break;
    default:
        error("Unrecognised reply from worker: " +
              JSON.stringify(event.data));
    }
}

function plotRegionOnWorker(region)
{
    getIdleWorker().postMessage(["plotRegion", params, region]);
}

function maybeCancelWorkers()
{
    regionQueue = [];
    busyWorkers.forEach((worker) => {
        worker.terminate();
    })
    busyWorkers = [];
    createWorkers();
}

function plotImage(canvas, startCallback, endCallback)
{
    plotterCanvas = canvas;
    plotterStartCallback = startCallback;
    plotterEndCallback = endCallback;

    maybeCancelWorkers();
    doPlotImage("main");
}

function doPlotImage(phase)
{
    plotterPhase = phase;
    plotterStartCallback(phase);
    startTime = performance.now();
    plotterStats = null;
    tileImage();
    dispatchWorkers();
}

function tileImage()
{
    // Break up the image into (mostly) square tiles and queue the regions to be
    // plotted.

    const minTileSidePixels = 100;
    const maxTilesPerSide = 4;

    let pw = params.image.width;
    let ph = params.image.height;

    // Calculate number of tiles per side.
    let pm = Math.min(pw, ph);
    let tps = Math.floor(pm / minTileSidePixels);
    tps = Math.max(tps, 1);
    tps = Math.min(tps, maxTilesPerSide);

    // Calculate tile size.
    let ts = Math.floor(pm / tps);
    let nx = Math.floor(pw / ts);
    let ny = Math.floor(ph / ts);

    assert(regionQueue.length === 0, "Region queue should be empty");
    for (let sy = 0; sy < ny; sy++) {
        let y0 = sy * ts;
        let y1 = (sy + 1) * ts;
        if (sy === ny - 1)
            y1 = ph;
        for (let sx = 0; sx < nx; sx++) {
            let x0 = sx * ts;
            let x1 = (sx + 1) * ts;
            if (sx === nx - 1)
                x1 = pw;
            regionQueue.push([x0, y0, x1, y1]);
        }
    }

    totalPixels = 0;
}

function dispatchWorkers()
{
    while (idleWorkers.length !== 0 && regionQueue.length !== 0)
        plotRegionOnWorker(regionQueue.shift());
}

function plotRegionFinished(region, buffer, pixels, stats)
{
    let [x0, y0, x1, y1] = region;
    assert(x1 > x0 && y1 > y0, "plotRegionFinished got bad region");

    let pw = x1 - x0;
    let ph = y1 - y0;
    assert(buffer.byteLength === pw * ph * 4, "Bad buffer size");

    dispatchWorkers();

    let colourData = new Uint8ClampedArray(buffer);

    let image;
    try {
        image = new ImageData(colourData, pw, ph);
    } catch (e) {
        // This may not work in IE.
        error("ImageData constructor not supported in your browser: " + e);
    }

    let context = plotterCanvas.getContext("2d");
    context.putImageData(image, x0, y0);

    totalPixels += pixels;
    accumulateStats(stats);

    if (busyWorkers.length === 0) {
        let endTime = performance.now();
        plotterEndCallback(plotterPhase, totalPixels, endTime - startTime, plotterStats);
        if (shouldIncreaseIterations(stats)) {
            params.maxIterations *= 2;
            doPlotImage("increaseIterations");
        } else {
            plotterCanvas = null;
        }
    }
}

function accumulateStats(stats)
{
    if (!plotterStats) {
        plotterStats = stats;
        return;
    }

    plotterStats.total += stats.total;
    for (let i = 0; i < stats.length; i++)
        plotterStats[i] += stats[i];
}

function shouldIncreaseIterations(stats)
{
    return params.autoIterations &&
           stats[stats.length - 1] / stats.total > 0.15;
}
