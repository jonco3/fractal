/*-*- Mode: JS; tab-width: 4 -*-*/

// Cached values
let canvas;
let canvasScale;

let lastMessage = null;

function init()
{
    params = {
        image: {
            width: undefined,
            height: undefined,
        },
        fractal: {
            name: "mandelbrot",
            param_cx: 0.0,
            param_cy: 0.0
        },
        coords: {
            centre_cx: -0.5,
            centre_cy: 0.0,
            size_cy: 2.0
        },
        autoIterations: true,
        antialias: 3,
        maxIterations: 256,
        plotter: "subdivide",
        threads: defaultThreadCount()
    };

    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForUpdateClickEvents();
    listenForFractalChangeEvents();
    maybeSetParamsFromQueryString();
    updateCoordsScale();
    updateHistoryState();
    updateFormFromParams();
    initPlotter();
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
        runPlotter();
    });
}

function listenForUpdateClickEvents()
{
    let button = document.getElementById("update");
    button.addEventListener("click", (event) => {
        setParamsFromForm();
        updateHistoryState();
        runPlotter();
    });
}

function listenForFractalChangeEvents()
{
    let fractal = document.forms[0].elements["fractal"];
    let param = document.getElementById("param");
    fractal.addEventListener("change", (event) => {
        setFractalParamVisibility(fractal.value);
    });
}

function setParamsFromForm()
{
    let form = document.forms[0];

    let fractal = form.elements["fractal"].value;
    if (fractal !== "mandelbrot" && fractal !== "julia")
        error("Bad fractal name: " + fractal);

    let param_cx = 0.0;
    let param_cy = 0.0;
    if (fractal === "julia") {
        param_cx = parseFloat(form.elements["param_cx"].value);
        param_cy = parseFloat(form.elements["param_cy"].value);
    }
    if (Number.isNaN(param_cx) || Number.isNaN(param_cy))
        error("Bad param value");

    let plotter = form.elements["plotter"].value;
    if (plotter !== "subdivide" && plotter !== "fill" && plotter !== "naive")
        error("Bad plotter name: " + plotter)

    let threads = parseInt(form.elements["threads"].value);
    if (threads < 1 || threads > 16)
        error("Bad thread count: " + threads);

    params.fractal.name = fractal;
    params.fractal.param_cx = param_cx;
    params.fractal.param_cy = param_cy;
    params.plotter = plotter;
    params.threads = threads;
}

function updateFormFromParams()
{
    let form = document.forms[0];
    form.elements["fractal"].value = params.fractal.name;
    form.elements["param_cx"].value = params.fractal.param_cx;
    form.elements["param_cy"].value = params.fractal.param_cy;
    form.elements["plotter"].value = params.plotter;
    form.elements["threads"].value = params.threads;
    setFractalParamVisibility(params.fractal.name);
}

function setFractalParamVisibility(fractal)
{
    let param = document.getElementById("param");
    if (fractal === "julia") {
        param.style.visibility = "visible";
    } else {
        param.style.visibility = "hidden";
    }
}

function maybeSetParamsFromQueryString()
{
    let query = window.location.search;
    if (!query)
        return;

    let elements = query.substring(1).split("&");
    if (elements.length !== 5 && elements.length !== 7) {
        alert("Bad query string (wrong number of elements)");
        return;
    }

    function parseElement(name, parseFunc = s => s)
    {
        if (elements.length === 0)
            return NaN;

        let s = elements.shift();
        if (s.substring(0, 1) !== name || s.length <= 2)
            return NaN;

        return parseFunc(s.substring(2));
    }

    let f = parseElement("f");
    let x = parseElement("x", parseFloat);
    let y = parseElement("y", parseFloat);
    let h = parseElement("h", parseFloat);
    let i = parseElement("i", parseInt);
    let p = 0.0;
    let q = 0.0;
    if (f === "julia") {
        p = parseElement("p", parseFloat);
        q = parseElement("q", parseFloat);
    }
    if ((f !== "mandelbrot" && f !== "julia") ||
        Number.isNaN(x) ||
        Number.isNaN(y) ||
        Number.isNaN(h) ||
        Number.isNaN(i) ||
        Number.isNaN(p) ||
        Number.isNaN(q))
    {
        alert("Bad query parameter");
        return;
    }


    params.fractal.name = f;
    params.fractal.param_cx = p;
    params.fractal.param_cy = q;
    params.coords.centre_cx = x;
    params.coords.centre_cy = y;
    params.coords.size_cy = h;
    params.maxIterations = i;
}

function queryStringFromParams()
{
    let a = [
        `f=${params.fractal.name}`,
        `x=${params.coords.centre_cx}`,
        `y=${params.coords.centre_cy}`,
        `h=${params.coords.size_cy}`,
        `i=${params.maxIterations}`
    ];
    if (params.fractal.name === "julia") {
        a.push(`p=${params.fractal.param_cx}`);
        a.push(`q=${params.fractal.param_cy}`);
    }
    return a.join("&");
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
    runPlotter();
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
    let url = "index.html?" + queryStringFromParams();
    if (history.state)
        history.pushState(params, document.title, url);
    else
        history.replaceState(params, document.title, url);
}

function zoomAt(px, py)
{
    setCoords(complexCoordForPixelX(px),
              complexCoordForPixelY(py),
              params.coords.size_cy / 2);
    updateHistoryState();
    runPlotter();
}

function runPlotter()
{
    clearMessages();
    plotImage(canvas, setStatusStarted, setStatusFinished);
}

function setStatusStarted(phase)
{
    if (phase === "main")
        addMessage("Plotting...");
    else if (phase === "increaseIterations")
        addMessage("Increasing iterations...");
    else if (phase === "antialias")
        addMessage("Antialiasing...");
    else
        error("Unknown phase: " + phase);
}

function setStatusFinished(phase, time, stats)
{
    let elems = [];
    let pw = canvas.width;
    let ph = canvas.height;

    if (phase === "main") {
        elems.push(`Mandelbrot set`);

        let cx = params.coords.centre_cx.toPrecision(4);
        let cy = params.coords.centre_cy.toPrecision(4);
        elems.push(`centered on (${cx}, ${cy}),`)

        let ch = params.coords.size_cy.toPrecision(4);
        elems.push(`height ${ch},`);

        elems.push(`image size ${pw} x ${ph},`);

        elems.push(`max iterations ${params.maxIterations},`);
    } else if (phase === "increaseIterations") {
        elems.push(`Increased max iterations to ${params.maxIterations},`);
    } else if (phase === "antialias") {
        elems.push(`Antialiased to factor ${params.antialias},`);
    }

    let plotted = (100 * stats.pixelsPlotted / stats.totalPixels).toPrecision(3);
    elems.push(`${plotted}% of pixels calculated`);

    let ms = time.toPrecision(3);
    elems.push(`in ${ms} mS`);

    updateMessage(elems.join(" "));
}

function clearMessages()
{
    let messages = document.getElementById("messages");
    while (messages.firstChild)
        messages.removeChild(messages.firstChild);
    lastMessage = null;
}

function addMessage(text)
{
    lastMessage = document.createElement("p");
    document.getElementById("messages").appendChild(lastMessage);
    updateMessage(text);
}

function updateMessage(text)
{
    assert(lastMessage, "No message to update");
    lastMessage.textContent = text;
}
