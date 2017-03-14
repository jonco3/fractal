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
        maxIterations: 256,
        colours: {
            logarithmic: true,
            scale: 7,
            rOffset: 0.445,
            gOffset: 0.135,
            bOffset: 0.33,
        },
        plotter: "subdivide",
        threads: defaultThreadCount(),
        antialias: 3
    };

    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForTabClickEvents();
    listenForFractalChangeEvents();
    listenForColourMapChangeEvents();
    listenForUpdateClickEvents();
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

function listenForTabClickEvents()
{
    let buttons = document.getElementsByClassName("tab-button");
    let tabs = document.getElementsByClassName("tab");

    for (let i = 0; i < buttons.length; i++) {
        let clicked = buttons[i];
        let selectedTab = document.getElementById(clicked.id.replace("-button", ""));
        clicked.addEventListener("click", event => {
            for (let j = 0; j < buttons.length; j++) {
                let button = buttons[j];
                button.className = button.className.replace(" active", "");
            }
            clicked.className += " active";
            for (let j = 0; j < tabs.length; j++) {
                let tab = tabs[j];
                if (tab === selectedTab)
                    tab.style.display = "block";
                else
                    tab.style.display = "none";
            }
            if (selectedTab.id == "colours-tab") {
                resizeColourMap(canvasScale);
                displayColourMap();
            }
        });
    }
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

function listenForColourMapChangeEvents()
{
    let form = document.forms[0];

    function connectSliderAndValue(name) {
        let slider = form.elements[name + "Slider"];
        let value = form.elements[name + "Value"];
        assert(slider && value, "Can't find elements for: " + name);

        value.value = slider.value;

        function listener() {
            value.value = slider.value;
            displayColourMap();
        }

        slider.addEventListener("change", listener);
        slider.addEventListener("input", listener);
    }

    // TODO: reflect value changes in the slider position.
    connectSliderAndValue("colourScale");
    connectSliderAndValue("redOffset");
    connectSliderAndValue("greenOffset");
    connectSliderAndValue("blueOffset");
}

function parseBool(s) {
    if (s === "1")
        return true;
    if (s === "0")
        return false;
    return NaN;
}

function getColourMapForm()
{
    let form = document.forms[0];

    let logColour = parseBool(form.elements["logColour"].value);
    if (Number.isNaN(logColour))
        error("Bad logColour value");

    let colourScale = parseFloat(form.elements["colourScaleSlider"].value);
    if (Number.isNaN(colourScale))
        error("Bad colourScale value");
    
    let redOffset = parseFloat(form.elements["redOffsetSlider"].value);
    let greenOffset = parseFloat(form.elements["greenOffsetSlider"].value);
    let blueOffset = parseFloat(form.elements["blueOffsetSlider"].value);
    if (Number.isNaN(redOffset) || Number.isNaN(greenOffset) || Number.isNaN(blueOffset))
        error("Bad colour offset value");

    return {
        logarithmic: logColour,
        scale: colourScale,
        rOffset: redOffset,
        gOffset: greenOffset,
        bOffset: blueOffset
    };
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

    let colours = getColourMapForm();

    let plotter = form.elements["plotter"].value;
    if (plotter !== "subdivide" && plotter !== "fill" && plotter !== "naive")
        error("Bad plotter name: " + plotter)

    let threads = parseInt(form.elements["threads"].value);
    if (threads < 1 || threads > 16)
        error("Bad thread count: " + threads);

    params.fractal.name = fractal;
    params.fractal.param_cx = param_cx;
    params.fractal.param_cy = param_cy;
    params.colours = colours;
    params.plotter = plotter;
    params.threads = threads;
}

function updateFormFromParams()
{
    let form = document.forms[0];
    form.elements["fractal"].value = params.fractal.name;
    form.elements["param_cx"].value = params.fractal.param_cx;
    form.elements["param_cy"].value = params.fractal.param_cy;
    form.elements["logColour"].value = params.colours.logarithmic ? "1" : "0";
    form.elements["colourScaleSlider"].value = params.colours.scale;
    form.elements["colourScaleValue"].value = params.colours.scale;
    form.elements["redOffsetSlider"].value = params.colours.rOffset;
    form.elements["redOffsetValue"].value = params.colours.rOffset;
    form.elements["greenOffsetSlider"].value = params.colours.gOffset;
    form.elements["greenOffsetValue"].value = params.colours.gOffset;
    form.elements["blueOffsetSlider"].value = params.colours.bOffset;
    form.elements["blueOffsetValue"].value = params.colours.bOffset;
    form.elements["plotter"].value = params.plotter;
    form.elements["threads"].value = params.threads;
    setFractalParamVisibility(params.fractal.name);
}

function setFractalParamVisibility(fractal)
{
    let param = document.getElementById("param");
    if (fractal === "julia") {
        param.style.display = "block";
    } else {
        param.style.display = "none";
    }
}

function maybeSetParamsFromQueryString()
{
    let query = window.location.search;
    if (!query)
        return;

    let elements = query.substring(1).split("&");

    let ok = true;

    function parseElement(name, parseFunc = s => s)
    {
        let v = NaN;
        if (elements.length > 0) {
            let s = elements.shift();
            let match = name + "=";
            if (s.startsWith(match) && s.length > match.length)
                v = parseFunc(s.substring(match.length));
        }

        if (v === NaN) {
            alert("Bad query parameter: " + name);
            ok = false;
        }

        return v;
    }

    let f = parseElement("f");
    if (f !== "mandelbrot" && f !== "julia") {
        alert("Unknown fractal: " + f);
        return;
    }

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
    let l = parseElement("l", parseBool);
    let s = parseElement("s", parseFloat);
    let r = parseElement("r", parseFloat);
    let g = parseElement("g", parseFloat);
    let b = parseElement("b", parseFloat);

    if (!ok)
        return;

    params.fractal.name = f;
    params.fractal.param_cx = p;
    params.fractal.param_cy = q;
    params.coords.centre_cx = x;
    params.coords.centre_cy = y;
    params.coords.size_cy = h;
    params.maxIterations = i;
    params.colours.logarithmic = l;
    params.colours.scale = s;
    params.colours.rOffset = r;
    params.colours.gOffset = g;
    params.colours.bOffset = b;
}

function queryStringFromParams()
{
    let a = [];

    function add(name, value) {
        a.push(`${name}=${value}`);
    }

    add("f", params.fractal.name);
    add("x", params.coords.centre_cx);
    add("y", params.coords.centre_cy);
    add("h", params.coords.size_cy);
    add("i", params.maxIterations);
    if (params.fractal.name === "julia") {
        add("p", params.fractal.param_cx);
        add("q", params.fractal.param_cy);
    }
    add("l", params.colours.logarithmic ? 1 : 0);
    add("s", params.colours.scale);
    add("r", params.colours.rOffset);
    add("g", params.colours.gOffset);
    add("b", params.colours.bOffset);

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
        elems.push(`Antialiased, ${params.antialias} x ${params.antialias} subpixels,`);
    }

    let plotted = (100 * stats.pixelsPlotted / stats.totalPixels).toPrecision(3);
    elems.push(`${plotted}% of pixels calculated`);

    let ms = time.toPrecision(3);
    if (ms > 1000)
        elems.push(`in ${(ms / 1000).toPrecision(3)} S`);
    else
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

function resizeColourMap(scale)
{
    let container = document.getElementById("colourmapContainer");
    assert(container, "Can't find colourmap container");

    let width = container.offsetWidth;
    let height = 50;

    let pw = Math.floor(width * scale);
    let ph = Math.floor(height * scale);

    let canvas = document.getElementById("colourmap");
    let context = canvas.getContext("2d");

    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = width;
    canvas.style.height = height;
    context.scale(scale, scale);
}

function displayColourMap()
{
    let colours = getColourMapForm();
    let map = buildColourMap(colours);
    let canvas = document.getElementById("colourmap");
    let context = canvas.getContext("2d");
    let image = context.createImageData(canvas.width, canvas.height);
    let imageData = new Uint32Array(image.data.buffer);

    let i = 0;
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            let j = Math.floor(2 * 1024 * (x / canvas.width));
            imageData[i++] = map.data[j % 1024 + 1];
        }
    }

    context.putImageData(image, 0, 0);
}
