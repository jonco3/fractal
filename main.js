/*-*- Mode: JS; tab-width: 4 -*-*/

// Cached values
let canvas;
let canvasScale;

let worker;
let workerBusy;

let startTime;

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
        plotter: "subdivide"
    };

    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForUpdateClickEvents();
    updateCoordsScale();
    updateHistoryState();
    updateParamForm();
    createWorker();
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

function createWorker()
{
    if (!window.Worker)
        error("Requires workers -- please upgrade your browser");

    workerBusy = false;
    worker = new Worker("worker.js");

    var testBuffer = new ArrayBuffer(1);
    worker.postMessage(["test", testBuffer], [testBuffer]);
    if (testBuffer.byteLength)
        error("Requires Transferables -- please upgrade your browser");

    worker.onmessage = (event) => {
        switch(event.data[0]) {
        case "error":
            alert(event.data[1]);
            break;
        case "plotRegionFinished":
            assert(workerBusy, "Worker not running");
            workerBusy = false;
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
    };
}

function plotImageOnWorker(params)
{
    assert(!workerBusy, "Worker already running");
    workerBusy = true;
    let region = [0, 0, params.image.width, params.image.height];
    worker.postMessage(["plotRegion", params, region]);
}

function maybeCancelWorker()
{
    if (workerBusy) {
        worker.terminate();
        createWorker();
    }
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
    startTime = performance.now();
    maybeCancelWorker();
    setStatusPlotting();
    plotImageOnWorker(params);
}

function plotRegionFinished(region, arrayBuffer, pixels)
{
    let [x0, y0, x1, y1] = region;
    assert(x1 > x0 && y1 > y0);

    let pw = x1 - x0;
    let ph = y1 - y0;
    let buffer = new Uint32Array(arrayBuffer);
    assert(buffer.length == pw * ph);

    let context = canvas.getContext("2d");
    let image = context.createImageData(pw, ph);
    coloriseBuffer(image.data, buffer);
    let endTime = performance.now();
    context.putImageData(image, x0, y0);
    setStatusFinished(pixels, endTime - startTime);
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
