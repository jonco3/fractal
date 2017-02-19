let canvas;
let canvasScale;
let coords;
let coordsScale;
let centrePixelX;
let centrePixelY;

function init()
{
    canvas = document.getElementById("canvas");
    listenForResizeEvent();
    listenForClickEvents();
    listenForPopStateEvents();
    initCoords();
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

function listenForClickEvents()
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
        coords = event.state;
        updateCoordsScale();
        updateImage();
    });
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
    if (size_cy == 0) {
        alert("Bad complex height");
        return;
    }
    coords = {
        centre_cx: centre_cx,
        centre_cy: centre_cy,
        size_cy: size_cy
    };
    updateCoordsScale();
    if (history.state)
        history.pushState(coords, "");
    else
        history.replaceState(coords, "");
}

function updateCoordsScale()
{
    coordsScale = coords.size_cy / canvas.height;
    centrePixelX = Math.floor(canvas.width / 2);
    centrePixelY = Math.floor(canvas.height / 2);
}

function complexCoordForPixelX(px)
{
    return coords.centre_cx + coordsScale * (px - centrePixelX);
}

function complexCoordForPixelY(py)
{
    return coords.centre_cy + coordsScale * (py - centrePixelY);
}

function zoomAt(px, py)
{
    setCoords(complexCoordForPixelX(px),
              complexCoordForPixelY(py),
              coords.size_cy / 2);
    updateImage();
}

function updateImage()
{
    let context = canvas.getContext("2d");
    image = context.createImageData(canvas.width, canvas.height);
    let t0 = performance.now();
    let pixels = plotDivide(image);
    let t1 = performance.now();
    context.putImageData(image, 0, 0);
    updateStatus(coords, image, pixels, t1 - t0);
}

function updateStatus(coords, image, pixels, time)
{
    let elems = [];

    elems.push(`Mandelbrot set`)

    let cx = coords.centre_cx.toPrecision(4);
    let cy = coords.centre_cy.toPrecision(4);
    elems.push(`centered on (${cx}, ${cy}),`)

    let ch = coords.size_cy.toPrecision(4);
    elems.push(`height ${ch},`);

    elems.push(`image size ${image.width} x ${image.height},`);

    let totalPixels = image.width * image.height;
    let plotted = (100 * pixels / totalPixels).toPrecision(2);
    elems.push(`${plotted}% of pixels plotted`);

    let ms = time.toPrecision(3);
    elems.push(`in ${ms} mS`);

    let status = document.getElementById("status");
    status.textContent = elems.join(" ");
}

function plotAll(image)
{
    let pw = image.width;
    let ph = image.height;
    let i = 0;
    for (let py = 0; py < ph; py++) {
        let cy = complexCoordForPixelY(py);
        for (let px = 0; px < pw; px++) {
            let cx = complexCoordForPixelX(px);
            let r = iterations(cx, cy, 512);
            coloriseAndSetPixel(image, i, r);
            i += 4;
        }
    }
    return pw * ph;
}

function plotFill(image) {
    let px;
    let py;
    let pw = image.width;
    let ph = image.height;

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
    let data = new Uint32Array(pw * ph);
    while (!empty()) {
        pop();
        let i = px + py * pw;
        if (data[i])
            continue;

        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(py);
        let r = iterations(cx, cy, 512);
        data[i] = r + 1;
        pixels++;

        if (r === 0)
            continue;

        if (px > 0 && data[i - 1] === 0)
            push(px - 1, py);
        if (py > 0 && data[i - pw] === 0)
            push(px, py - 1);
        if (px < pw - 1 && data[i + 1] === 0)
            push(px + 1, py);
        if (py < ph - 1 && data[i + pw] === 0)
            push(px, py + 1);
    }

    let i = 0;
    for (py = 0; py < ph; py++) {
        for (px = 0; px < pw; px++) {
            let r = data[i];
            if (r !== 0)
                r--;
            coloriseAndSetPixel(image, i * 4, r)
            i++;
        }
    }

    return pixels;
}

function plotDivide(image) {
    let px;
    let py;
    let pw = image.width;
    let ph = image.height;
    let pixels = 0;

    function pixel(px, py) {
        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(py);
        let r = iterations(cx, cy, 512);
        coloriseAndSetPixel(image, (px + py * pw) * 4, r);
        pixels++;
        return r;
    }

    function plotLineX(py, x0, x1) {
        let first = pixel(x0, py);
        let same = true;
        for (let px = x0 + 1; px < x1; px++) {
            let r = pixel(px, py);
            same = same && r === first;
        }
        return same ? first : -1;
    }

    function plotLineY(px, y0, y1) {
        let first = pixel(px, y0);
        let same = true;
        for (let py = y0 + 1; py < y1; py++) {
            let r = pixel(px, py);
            same = same && r === first;
        }
        return same ? first : -1;
    }

    function recurse(x0, y0, x1, y1) {
        if (x1 <= x0 || y1 <= y0) {
            alert("Bad pixel coordinates in plotDivide");
            return;
        }
        if (x1 - x0 < 5 || y1 - y0 < 5) {
            for (let py = y0; py < y1; py++)
                plotLineX(py, x0, x1);
            return;
        }

        let top =    plotLineX(y0,     x0,     x1 - 1);
        let right =  plotLineY(x1 - 1, y0,     y1 - 1);
        let bottom = plotLineX(y1 - 1, x0 + 1, x1);
        let left =   plotLineY(x0,     y0 + 1, y1);

        if (top !== -1 && top === right && right == bottom && bottom == left) {
            for (let py = y0; py < y1; py++) {
                for (let px = x0; px < x1; px++)
                    coloriseAndSetPixel(image, (px + py * pw) * 4, top);
            }
        } else {
            let mx = Math.round((x0 + x1) / 2);
            let my = Math.round((y0 + y1) / 2);
            recurse(x0 + 1, y0 + 1, mx,     my);
            recurse(mx,     y0 + 1, x1 - 1, my);
            recurse(x0 + 1, my,     mx,     y1 - 1);
            recurse(mx,     my,     x1 - 1, y1 - 1);
        }
    }

    recurse(0, 0, image.width, image.height);

    return pixels;
}

function coloriseAndSetPixel(image, i, r)
{
    if (r === 0) {
        image.data[i + 0] = 0;
        image.data[i + 1] = 0;
        image.data[i + 2] = 0;
    } else {
        image.data[i + 0] = r % 255;
        image.data[i + 1] = (r + 80) % 255;
        image.data[i + 2] = (r + 160) % 255
    }
    image.data[i + 3] = 255;
}

function iterations(cx, cy, maxIterations)
{
    let zx = cx;
    let zy = cy;
    let i = 1;
    while (i < maxIterations) {
        let xx = zx * zx;
        let yy = zy * zy;
        if (xx + yy >= 4)
            return i;

        zy = 2 * zx * zy + cy;
        zx = xx - yy + cx;
        i++;
    }

    return 0;
}
