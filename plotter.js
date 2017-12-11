/*-*- Mode: JS; tab-width: 4 -*-*/

let plotterCanvas = null;
let plotterStartCallback;
let plotterEndCallback;

let colourMap;

let idleWorkers = [];
let busyWorkers = [];

let plotterPhase;
let startTime;
let totalPixels;

let dirtyRegion;
let regionQueue = [];

let plotterStats = null;

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
        assert(event.data.length === 4, "Bad response from plotRegion");
        let [, region, buffer, stats] = event.data;
        plotRegionFinished(region, buffer, stats);
        break;
    default:
        error("Unrecognised reply from worker: " +
              JSON.stringify(event.data));
    }
}

function plotRegionOnWorker(region)
{
    let worker = getIdleWorker();
    if (plotterPhase !== "antialias") {
        worker.postMessage(["plotRegion", params, region, colourMap]);
    } else {
        let buffer = getImageData(region).buffer;
        worker.postMessage(["antialiasRegion", params, region, colourMap, buffer], [buffer]);
    }
}

function getImageData(region)
{
    let [x0, y0, x1, y1] = region;
    assert(x1 > x0 && y1 > y0, "getImageData got bad region");
    let context = plotterCanvas.getContext("2d");
    let imageData = context.getImageData(x0, y0, x1 - x0, y1 - y0);
    return imageData.data;
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

function startPlotRegion(canvas, region, startCallback, endCallback)
{
    plotterCanvas = canvas;
    plotterStartCallback = startCallback;
    plotterEndCallback = endCallback;

    dirtyRegion = region;
    tileDirtyRegion();

    maybeCancelWorkers();
    colourMap = buildColourMap(params.colours);
    startPlotPhase("main");
}

function startPlotPhase(phase)
{
    // TODO: start antialiasing as soon we have idle workers after main image
    // plotted.
    assert(regionQueue.length === 0, "Expected empty region queue");
    assert(busyWorkers.length === 0, "Expected no busy workers");

    plotterPhase = phase;
    plotterStartCallback(phase);
    startTime = performance.now();
    plotterStats = null;
    regionQueue = dirtyRegion.slice();
    dispatchWorkers();
}

function tileDirtyRegion()
{
    // Break up the dirty region up into (mostly) square tiles and queue the
    // regions to be plotted.

    const minTileSidePixels = 100;
    const maxTilesPerSide = 4;

    let region = dirtyRegion;
    dirtyRegion = [];

    for (let [rx0, ry0, rx1, ry1] of region) {
        assert(rx1 > rx0 && ry1 > ry0, "Bad region");

        let pw = rx1 - rx0;
        let ph = ry1 - ry0;

        // Calculate number of tiles per side.
        let pm = Math.min(pw, ph);
        let tps = Math.floor(pm / minTileSidePixels);
        tps = Math.max(tps, 1);
        tps = Math.min(tps, maxTilesPerSide);

        // Calculate tile size.
        let ts = Math.floor(pm / tps);
        let nx = Math.floor(pw / ts);
        let ny = Math.floor(ph / ts);

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
                dirtyRegion.push([x0 + rx0, y0 + ry0, x1 + rx0, y1 + ry0]);
            }
        }
    }
}

function dispatchWorkers()
{
    while (idleWorkers.length !== 0 && regionQueue.length !== 0)
        plotRegionOnWorker(regionQueue.shift());
}

function plotRegionFinished(region, buffer, stats)
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

    accumulateStats(stats);

    if (busyWorkers.length === 0) {
        let endTime = performance.now();
        plotterEndCallback(plotterPhase, endTime - startTime, plotterStats);
        if (plotterPhase !== "antialias") {
            if (shouldIncreaseIterations(plotterStats)) {
                params.maxIterations *= 2;
                startPlotPhase("increaseIterations");
            } else if (params.antialias) {
                startPlotPhase("antialias");
            }
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

    plotterStats.totalPixels += stats.totalPixels;
    plotterStats.pixelsPlotted += stats.pixelsPlotted;

    if (plotterPhase !== "antialias") {
        plotterStats.blackPixels += stats.blackPixels;
        plotterStats.edgePixels += stats.edgePixels;
        for (let i = 0; i < stats.edgeDist.length; i++)
            plotterStats.edgeDist[i] += stats.edgeDist[i];
    }
}

function shouldIncreaseIterations(stats)
{
    if (!params.autoIterations)
        return false;

    let edgeDist = stats.edgeDist;
    return edgeDist[edgeDist.length - 1] / stats.edgePixels > 0.2;
}

function buildColourMap(colours)
{
    const size = 1024;

    let scale;
    if (colours.logarithmic)
        scale = 1 / colours.scale;
    else
        scale = 1 / Math.pow(2, colours.scale);

    let colourMap = {
        size: size,
        logarithmic: colours.logarithmic,
        scale: scale,
        data: new Uint32Array(size + 1),
    };

    let bytes = new Uint8ClampedArray(colourMap.data.buffer);

    bytes[0] = 0;
    bytes[1] = 0;
    bytes[2] = 0;
    bytes[3] = 255;

    let r = colours.rOffset;
    let g = colours.gOffset + r;
    let b = colours.bOffset + g;

    function sinusoid(v)
    {
        return 0.5 * (Math.sin(2 * Math.PI * v) + 1);
    }

    let j = 4;
    for (let i = 0; i < size; i++) {
        let v = i / size;
        bytes[j + 0] = Math.floor(sinusoid(v + r) * 255);
        bytes[j + 1] = Math.floor(sinusoid(v + g) * 255);
        bytes[j + 2] = Math.floor(sinusoid(v + b) * 255);
        bytes[j + 3] = 255;
        j += 4;
    }

    return colourMap;
}
