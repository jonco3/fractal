/*-*- Mode: JS; tab-width: 4 -*-*/

// Cached values
let canvas;
let canvasScale;

let idleWorkers = [];
let busyWorkers = [];

let startTime;
let totalPixels;

let regionQueue = [];

function error(message)
{
    alert(message);
    throw message;
}

function init()
{
    params = {
        image: {
            width: undefined,
            height: undefined,
        },
        coords: {
            centre_cx: -0.5,
            centre_cy: 0.0,
            size_cy: 2.0
        },
        maxIterations: 512,
        plotter: "subdivide",
        threads: 4
    };

    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForUpdateClickEvents();
    updateCoordsScale();
    updateHistoryState();
    updateParamForm();
    createWorkers();
    resizeCanvas();
}

function listenForResizeEvent()
{
    let running = false;
    window.addEventListener("resize", () => {
        if (running)
            return;
        requestAnimationFrame(
            () => {
                resizeCanvas();
                running = false;
            });
    });
}

function listenForCanvasClickEvents()
{
    canvas.addEventListener("click", (event) => {
        let rect = canvas.getBoundingClientRect();
        let x = Math.round((event.clientX - rect.left) * canvasScale);
        let y = Math.round((event.clientY - rect.top) * canvasScale);
        if (event.detail == 2)
            zoomAt(x, y);
    });
}

function listenForPopStateEvents()
{
    window.addEventListener("popstate", (event) => {
        params = event.state;
        updateParamForm();
        updateCoordsScale();
        plotImage();
    });
}

function listenForUpdateClickEvents()
{
    let button = document.getElementById("update");
    let plotterChoice = document.getElementById("plotterChoice");
    button.addEventListener("click", (event) => {
        params.plotter = plotterChoice.value;
        updateHistoryState();
        plotImage();
    });
}

function updateParamForm()
{
    let plotterChoice = document.getElementById("plotterChoice");
    plotterChoice.value = params.plotter;
}

function createWorkers()
{
    if (!window.Worker)
        error("Requires workers -- please upgrade your browser");

    assert(busyWorkers.length == 0,
           "createWorkers expects no workers to be running");

    assert(typeof params.threads === 'number' &&
           params.threads > 0 && params.threads <= 8,
           "Bad thread count parameter");

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
        let region = event.data[1];
        let arrayBuffer = event.data[2];
        let pixels = event.data[3];
        plotRegionFinished(region, arrayBuffer, pixels);
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

function resizeCanvas()
{
    let container = document.getElementById("container");
    let width = container.offsetWidth;
    let height = width * 9/16;

    // Handle high DPI screens
    let context = canvas.getContext("2d");
    let devicePixelRatio = window.devicePixelRatio || 1;
    let backingStoreRatio =
        context.webkitBackingStorePixelRatio ||
        context.mozBackingStorePixelRatio ||
        context.msBackingStorePixelRatio ||
        context.oBackingStorePixelRatio ||
        context.backingStorePixelRatio || 1;
    canvasScale = devicePixelRatio / backingStoreRatio;

    canvas.width = width * canvasScale;
    canvas.height = height * canvasScale;
    canvas.style.width = width;
    canvas.style.height = height;
    context.scale(canvasScale, canvasScale);

    params.image.width = canvas.width;
    params.image.height = canvas.height;
    updateCoordsScale();
    plotImage();
}

function setCoords(centre_cx, centre_cy, size_cy)
{
    assert(size_cy !== 0, "Bad complex height");
    params.coords = {
        centre_cx: centre_cx,
        centre_cy: centre_cy,
        size_cy: size_cy
    };
    updateCoordsScale();
}

function updateHistoryState()
{
    if (history.state)
        history.pushState(params, "");
    else
        history.replaceState(params, "");
}

function zoomAt(px, py)
{
    setCoords(complexCoordForPixelX(px),
              complexCoordForPixelY(py),
              params.coords.size_cy / 2);
    updateHistoryState();
    plotImage();
}

function plotImage()
{
    // Break up the image into (mostly) square tiles and queue the regions to be
    // plotted.

    const minTileSidePixels = 200;
    const maxTilesPerSide = 4;

    assert(regionQueue.length === 0, "Region queue should be empty");

    maybeCancelWorkers();
    setStatusPlotting();

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
    startTime = performance.now();
    dispatchWorkers();
}

function dispatchWorkers()
{
    while (idleWorkers.length !== 0 && regionQueue.length !== 0)
        plotRegionOnWorker(regionQueue.shift());
}

function plotRegionFinished(region, arrayBuffer, pixels)
{
    let [x0, y0, x1, y1] = region;
    assert(x1 > x0 && y1 > y0, "plotRegionFinished got bad region");

    dispatchWorkers();

    let pw = x1 - x0;
    let ph = y1 - y0;
    let buffer = new Uint32Array(arrayBuffer);
    assert(buffer.length == pw * ph, "Bad buffer size");

    let context = canvas.getContext("2d");
    let image = context.createImageData(pw, ph);
    coloriseBuffer(image.data, buffer);
    context.putImageData(image, x0, y0);

    totalPixels += pixels

    if (busyWorkers.length === 0) {
        let endTime = performance.now();
        setStatusFinished(totalPixels, endTime - startTime);
    }
}

function setStatusPlotting()
{
    let status = document.getElementById("status");
    status.textContent = "Plotting...";
}

function setStatusFinished(pixels, time)
{
    let elems = [];

    elems.push(`Mandelbrot set`)

    let cx = params.coords.centre_cx.toPrecision(4);
    let cy = params.coords.centre_cy.toPrecision(4);
    elems.push(`centered on (${cx}, ${cy}),`)

    let ch = params.coords.size_cy.toPrecision(4);
    elems.push(`height ${ch},`);

    elems.push(`max iterations ${params.maxIterations},`);

    let pw = canvas.width;
    let ph = canvas.height;
    elems.push(`image size ${pw} x ${ph},`);

    let plotted = (100 * pixels / (pw * ph)).toPrecision(3);
    elems.push(`${plotted}% of pixels calculated`);

    let ms = time.toPrecision(3);
    elems.push(`in ${ms} mS`);

    let status = document.getElementById("status");
    status.textContent = elems.join(" ");
}

function setPlotter(name)
{
    params.plotter = name;
}

function coloriseBuffer(imageData, buffer)
{
    for (let i = 0; i < buffer.length; i++) {
        r = buffer[i];
        colorisePixel(imageData, i * 4, r);
    }
}

function colorisePixel(imageData, i, r)
{
    if (r <= 1) {
        imageData[i + 0] = 0;
        imageData[i + 1] = 0;
        imageData[i + 2] = 0;
    } else {
        imageData[i + 0] = r % 255;
        imageData[i + 1] = (r + 80) % 255;
        imageData[i + 2] = (r + 160) % 255
    }
    imageData[i + 3] = 255;
}
