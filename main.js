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
    plotTo(image, -0.5, 0.0, 2.0, 0, 0);
    context.putImageData(image, 0, 0);
}

function plotTo(image, cx, cy, ch, ox, oy) {
    let i = 0;
    let pw = image.width;
    let ph = image.height;
    let s = ch / ph;
    ox -= Math.floor(pw / 2);
    oy -= Math.floor(ph / 2);
    for (let py = 0; py < ph; py++) {
        let y = cy + s * (py + oy);
        for (let px = 0; px < pw; px++) {
            let x = cx + s * (px + ox);
            let r = iterations(x, y);
            image.data[i+0] = r % 255
            image.data[i+1] = r % 255
            image.data[i+2] = r % 255
            image.data[i+3] = 255;
            i += 4;
        }
    }
}

function iterations(cx, cy)
{
    let zx = cx;
    let zy = cy;
    let i = 1;
    while (i < 256) {
        let xx = zx * zx;
        let yy = zy * zy;
        if (xx + yy >= 4)
            break;

        zy = 2 * zx * zy + cy;
        zx = xx - yy + cx;
        i++;
    }

    return i;
}
