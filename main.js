function init()
{
    listenForResizeEvent();
    resizeCanvas();
}

function listenForResizeEvent()
{
    let running = false;

    function handleResize() {
        if (running)
            return;
        requestAnimationFrame(
            () => {
                resizeCanvas();
                running = false;
            });
    }

    window.addEventListener("resize", handleResize);
}

function resizeCanvas()
{
    let container = document.getElementById("container");
    let canvas = document.getElementById("canvas");
    canvas.width = container.offsetWidth
    canvas.height = canvas.width * 9/16;
    let context = canvas.getContext("2d");
    image = context.createImageData(canvas.width, canvas.height);
    let coords = {
        centre_cx: -0.5,
        centre_cy: 0.0,
        size_cy: 2.0,
        offset_px: 0,
        offset_py: 0
    };
    let t0 = performance.now();
    let pixels = plotTo(image, coords);
    let t1 = performance.now();
    context.putImageData(image, 0, 0);
    let status = document.getElementById("status");
    status.textContent =
        `Mandelbrot set, ` +
        `centered on (${coords.centre_cx}, ${coords.centre_cy}), ` +
        `height ${coords.size_cy}, ` +
        `image size ${image.width} x ${image.height}, ` +
        `${100 * pixels / (image.width * image.height)}% of pixels plotted ` +
        `in ${t1 - t0} mS`;
}

function plotTo(image, coords)
{
    let pw = image.width;
    let ph = image.height;
    let cx = coords.centre_cx;
    let cy = coords.centre_cy;
    let ch = coords.size_cy;
    let ox = coords.offset_px;
    let oy = coords.offset_py;
    let i = 0;
    let s = ch / ph;
    ox -= Math.floor(pw / 2);
    oy -= Math.floor(ph / 2);
    for (let py = 0; py < ph; py++) {
        let y = cy + s * (py + oy);
        for (let px = 0; px < pw; px++) {
            let x = cx + s * (px + ox);
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
