// Parameters
let params = {}

// Cached values
let canvas;
let canvasScale;
let coordsScale;
let centrePixelX;
let centrePixelY;

function assert(cond, message)
{
    if (!cond)
        error("Assertion failed: " + message);
}

function error(message)
{
    alert(message);
    throw message;
}

function init()
{
    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForCanvasClickEvents();
    listenForPopStateEvents();
    listenForUpdateClickEvents();
    initCoords();
    initPlotter();
    updateHistoryState();
    updateParamForm();
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
        updateImage();
    });
}

function listenForUpdateClickEvents()
{
    let button = document.getElementById("update");
    let plotterChoice = document.getElementById("plotterChoice");
    button.addEventListener("click", (event) => {
        params.plotter = plotterChoice.value;
        updateHistoryState();
        updateImage();
    });
}

function updateParamForm()
{
    let plotterChoice = document.getElementById("plotterChoice");
    plotterChoice.value = params.plotter;
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

    updateCoordsScale();
    updateImage();
}

function initCoords()
{
    setCoords(-0.5, 0.0, 2.0);
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

function updateCoordsScale()
{
    coordsScale = params.coords.size_cy / canvas.height;
    centrePixelX = Math.floor(canvas.width / 2);
    centrePixelY = Math.floor(canvas.height / 2);
}

function complexCoordForPixelX(px)
{
    return params.coords.centre_cx + coordsScale * (px - centrePixelX);
}

function complexCoordForPixelY(py)
{
    return params.coords.centre_cy + coordsScale * (py - centrePixelY);
}

function zoomAt(px, py)
{
    setCoords(complexCoordForPixelX(px),
              complexCoordForPixelY(py),
              params.coords.size_cy / 2);
    updateHistoryState();
    updateImage();
}

function updateImage()
{
    let context = canvas.getContext("2d");
    image = context.createImageData(canvas.width, canvas.height);
    let t0 = performance.now();
    let buffer = new Uint32Array(image.data.buffer);
    let plot = plotterFunc();
    let pixels = plot(image.width, image.height, buffer);
    coloriseBuffer(image.data, buffer);
    let t1 = performance.now();
    context.putImageData(image, 0, 0);
    updateStatus(pixels, t1 - t0);
}

function updateStatus(pixels, time)
{
    let elems = [];

    elems.push(`Mandelbrot set`)

    let cx = params.coords.centre_cx.toPrecision(4);
    let cy = params.coords.centre_cy.toPrecision(4);
    elems.push(`centered on (${cx}, ${cy}),`)

    let ch = params.coords.size_cy.toPrecision(4);
    elems.push(`height ${ch},`);

    let pw = canvas.width;
    let ph = canvas.height;
    elems.push(`image size ${pw} x ${ph},`);

    let plotted = (100 * pixels / (pw * ph)).toPrecision(2);
    elems.push(`${plotted}% of pixels plotted`);

    let ms = time.toPrecision(3);
    elems.push(`in ${ms} mS`);

    let status = document.getElementById("status");
    status.textContent = elems.join(" ");
}

function initPlotter()
{
    setPlotter("subdivide");
}

function setPlotter(name)
{
    params.plotter = name;
}

function plotterFunc()
{
    switch (params.plotter) {
    case "subdivide":
        return plotDivide;
    case "fill":
        return plotFill;
    case "naive":
        return plotAll;
    default:
        error("Unknown plotter: " + params.plotter);
    }
}

function plotAll(pw, ph, buffer)
{
    let i = 0;
    for (let py = 0; py < ph; py++) {
        let cy = complexCoordForPixelY(py);
        for (let px = 0; px < pw; px++) {
            let cx = complexCoordForPixelX(px);
            buffer[i++] = iterations(cx, cy, 512);
        }
    }
    return pw * ph;
}

function plotFill(pw, ph, buffer) {
    let px;
    let py;

    let stack = [];

    function empty() {
        return stack.length === 0;
    }

    function push(x, y) {
        stack.push(x);
        stack.push(y);
    }

    function pop() {
        py = stack.pop();
        px = stack.pop();
    }

    for (px = 0; px < pw; px++) {
        push(px, 0);
        push(px, ph - 1);
    }
    for (py = 1; py < ph - 1; py++) {
        push(0, py);
        push(pw - 1, py);
    }

    let pixels = 0;
    while (!empty()) {
        pop();
        let i = px + py * pw;
        if (buffer[i])
            continue;

        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(py);
        let r = iterations(cx, cy, 512);
        buffer[i] = r;
        pixels++;

        if (r === 1)
            continue;

        if (px > 0 && buffer[i - 1] === 0)
            push(px - 1, py);
        if (py > 0 && buffer[i - pw] === 0)
            push(px, py - 1);
        if (px < pw - 1 && buffer[i + 1] === 0)
            push(px + 1, py);
        if (py < ph - 1 && buffer[i + pw] === 0)
            push(px, py + 1);
    }

    return pixels;
}

function plotDivide(pw, ph, buffer) {
    let px;
    let py;
    let pixels = 0;

    function plotPixel(px, py, cx, cy) {
        let r = iterations(cx, cy, 512);
        buffer[px + py * pw] = r;
        pixels++;
        return r;
    }

    function plotLineX(py, x0, x1) {
        let cx = complexCoordForPixelX(x0);
        let cy = complexCoordForPixelY(py);
        let first = plotPixel(x0, py, cx, cy);
        let same = true;
        for (let px = x0 + 1; px < x1; px++) {
            cx = complexCoordForPixelX(px);
            let r = plotPixel(px, py, cx, cy);
            same = same && r === first;
        }
        return same ? first : -1;
    }

    function plotLineY(px, y0, y1) {
        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(y0);
        let first = plotPixel(px, y0, cx, cy);
        let same = true;
        for (let py = y0 + 1; py < y1; py++) {
            cy = complexCoordForPixelY(py);
            let r = plotPixel(px, py, cx, cy);
            same = same && r === first;
        }
        return same ? first : -1;
    }

    function plotArea(x0, y0, x1, y1) {
        for (let py = y0; py < y1; py++)
            plotLineX(py, x0, x1);
    }

    function fillArea(x0, y0, x1, y1, r) {
        for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++)
                buffer[px + py * pw] = r;
        }
    }

    function recurse(x0, y0, x1, y1) {
        assert(x1 > x0 && y1 > y0, "Bad pixel coordinates");

        if (x1 - x0 < 5 || y1 - y0 < 5) {
            plotArea(x0, y0, x1, y1);
            return;
        }

        let top =    plotLineX(y0,     x0,     x1 - 1);
        let right =  plotLineY(x1 - 1, y0,     y1 - 1);
        let bottom = plotLineX(y1 - 1, x0 + 1, x1);
        let left =   plotLineY(x0,     y0 + 1, y1);

        if (top !== -1 && top === right && right == bottom && bottom == left) {
            fillArea(x0, y0, x1, y1, top);
        } else {
            let mx = Math.round((x0 + x1) / 2);
            let my = Math.round((y0 + y1) / 2);
            recurse(x0 + 1, y0 + 1, mx,     my);
            recurse(mx,     y0 + 1, x1 - 1, my);
            recurse(x0 + 1, my,     mx,     y1 - 1);
            recurse(mx,     my,     x1 - 1, y1 - 1);
        }
    }

    recurse(0, 0, pw, ph);

    return pixels;
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

function iterations(cx, cy, maxIterations)
{
    let zx = cx;
    let zy = cy;
    let i = 2;
    while (i < maxIterations) {
        let xx = zx * zx;
        let yy = zy * zy;
        if (xx + yy >= 4)
            return i;

        zy = 2 * zx * zy + cy;
        zx = xx - yy + cx;
        i++;
    }

    return 1;
}
