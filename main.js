/*-*- Mode: JS; tab-width: 4 -*-*/

// Cached values
let canvas;
let canvasScale;

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
        threads: defaultThreadCount()
    };

    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForUpdateClickEvents();
    updateCoordsScale();
    updateHistoryState();
    updateFormFromParams();
    initPlotter(canvas, setStatusPlotting, setStatusFinished);
    resizeCanvas();
}

function defaultThreadCount()
{
    return window.navigator.hardwareConcurrency || 4;
}

function listenForResizeEvent()
{
    let running = false;
    window.addEventListener("resize", () => {
        if (running)
            return;
        running = true;
        setTimeout(
            () => {
                resizeCanvas();
                running = false;
            },
        200);
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
        updateFormFromParams();
        updateCoordsScale();
        plotImage();
    });
}

function listenForUpdateClickEvents()
{
    let button = document.getElementById("update");
    button.addEventListener("click", (event) => {
        setParamsFromForm();
        updateHistoryState();
        plotImage();
    });
}

function setParamsFromForm()
{
    let form = document.forms[0];
    let plotter = form.elements["plotter"].value;
    if (plotter !== "subdivide" && plotter !== "fill" && plotter !== "naive")
        error("Bad plotter name: " + plotter)

    let threads = +form.elements["threads"].value;
    if (threads < 1 || threads > 16)
        error("Bad thread count: " + threads);

    params.plotter = plotter;
    params.threads = threads;
}

function updateFormFromParams()
{
    let form = document.forms[0];
    form.elements["plotter"].value = params.plotter;
    form.elements["threads"].value = params.threads;
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

    let pw = Math.floor(width * canvasScale);
    let ph = Math.floor(height * canvasScale);
    if (pw === params.image.width && ph === params.image.height)
        return;

    canvas.width = pw;
    canvas.height = ph;
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
