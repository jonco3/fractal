let canvas;
let canvasScale;
let coords;
let coordsScale;

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
        alert("popstate " + JSON.stringify(event.state));
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
    history.replaceState(coords, "");
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
        size_cy: size_cy,
        offset_px: 0,
        offset_py: 0
    };
    updateCoordsScale();
}

function updateCoordsScale()
{
    coordsScale = coords.size_cy / canvas.height;
}

function complexCoordForPixelX(px)
{
    px += coords.offset_px - Math.floor(image.width / 2);
    return coords.centre_cx + coordsScale * px;
}

function complexCoordForPixelY(py)
{
    py += coords.offset_py - Math.floor(image.height / 2);
    return coords.centre_cy + coordsScale * py;
}

function zoomAt(px, py)
{
    setCoords(complexCoordForPixelX(px),
              complexCoordForPixelY(py),
              coords.size_cy / 2);
    history.pushState(coords, "");
    updateImage();
}

function updateImage()
{
    let context = canvas.getContext("2d");
    image = context.createImageData(canvas.width, canvas.height);
    let t0 = performance.now();
    let pixels = plotTo(image, coords);
    let t1 = performance.now();
    context.putImageData(image, 0, 0);
    updateStatus(coords, image, pixels, t1 - t0);
}

function updateStatus(coords, image, pixels, time)
{
    let status = document.getElementById("status");
    status.textContent =
        `Mandelbrot set ` +
        `centered on (${coords.centre_cx}, ${coords.centre_cy}), ` +
        `height ${coords.size_cy}, ` +
        `image size ${image.width} x ${image.height}, ` +
        `${100 * pixels / (image.width * image.height)}% of pixels plotted ` +
        `in ${time} mS`;
}

function plotTo(image, coords)
{
    let pw = image.width;
    let ph = image.height;
    let i = 0;
    for (let py = 0; py < ph; py++) {
        let y = complexCoordForPixelY(py);
        for (let px = 0; px < pw; px++) {
            let x = complexCoordForPixelX(px);
            let r = iterations(x, y, 512);
            if (r === 0) {
                image.data[i+0] = 0;
                image.data[i+1] = 0;
                image.data[i+2] = 0;
            } else {
                image.data[i+0] = r % 255;
                image.data[i+1] = (r + 80) % 255;
                image.data[i+2] = (r + 160) % 255
            }
            image.data[i+3] = 255;
            i += 4;
        }
    }
    return pw * ph;
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
