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
        assert(workerBusy, "Worker not running");
        workerBusy = false;
        switch(event.data[0]) {
        case "error":
            alert(event.data[1]);
            break;
        case "plotImage":
            assert(event.data.length === 3, "Bad response from plotImage");
            plotImageFinished(event.data[1], event.data[2]);
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
    worker.postMessage(["plotImage", params]);
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

function plotImageFinished(arrayBuffer, pixels)
{
    let buffer = new Uint32Array(arrayBuffer);
    if (buffer.length !== params.image.width * params.image.height) {
        // It's possible we got resized while the worker was plotting.
        return;
    }

    let context = canvas.getContext("2d");
    let image = context.createImageData(canvas.width, canvas.height);
    coloriseBuffer(image.data, buffer);
    let endTime = performance.now();
    context.putImageData(image, 0, 0);
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
