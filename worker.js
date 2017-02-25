/*-*- Mode: JS; tab-width: 4 -*-*/

let params;

importScripts("common.js");

function assert(cond, message)
{
    if (!cond)
        error("Assertion failed: " + message);
}

function error(message)
{
    postMessage(["error", message]);
    throw message;
}

onmessage = (event) => {
    switch(event.data[0]) {
    case "test":
        break;
    case "plotImage":
        assert(event.data.length === 2, "Bad plotImage request");
        params = event.data[1];
        plotImage();
        break;
    default:
        error("Unrecognised request: " + JSON.stringify(event.data));
    }
};

function plotImageFinished(buffer, pixels)
{
    postMessage(["plotImage", buffer.buffer, pixels], [buffer.buffer]);
}

function plotImage()
{
    updateCoordsScale();
    let pw = params.image.width;
    let ph = params.image.height
    let buffer = new Uint32Array(pw * ph);
    let plot = plotterFunc();
    let pixels = plot(pw, ph, buffer);
    plotImageFinished(buffer, pixels);
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
            buffer[i++] = iterations(cx, cy);
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
        let r = iterations(cx, cy);
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

    function maybePlotPixel(px, py, cx, cy) {
        let i = px + py * pw;
        let r = buffer[i];
        if (!r) {
            r = iterations(cx, cy);
            buffer[i] = r;
            pixels++;
        }
        return r;
    }

    function plotLineX(py, x0, x1) {
        let cx = complexCoordForPixelX(x0);
        let cy = complexCoordForPixelY(py);
        let first = maybePlotPixel(x0, py, cx, cy);
        let same = true;
        for (let px = x0 + 1; px < x1; px++) {
            cx = complexCoordForPixelX(px);
            let r = maybePlotPixel(px, py, cx, cy);
            same = same && r === first;
        }
        return same ? first : -1;
    }

    function plotLineY(px, y0, y1) {
        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(y0);
        let first = maybePlotPixel(px, y0, cx, cy);
        let same = true;
        for (let py = y0 + 1; py < y1; py++) {
            cy = complexCoordForPixelY(py);
            let r = maybePlotPixel(px, py, cx, cy);
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
            let i = x0 + py * pw;
            for (let px = x0; px < x1; px++) {
                buffer[i++] = r;
            }
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
            fillArea(x0 + 1, y0 + 1, x1 - 1 , y1 - 1, top);
        } else {
            let mx = Math.round((x0 + x1) / 2);
            let my = Math.round((y0 + y1) / 2);
            recurse(x0, y0, mx, my);
            recurse(mx, y0, x1, my);
            recurse(x0, my, mx, y1);
            recurse(mx, my, x1, y1);
        }
    }

    recurse(0, 0, pw, ph);
    return pixels;
}

function iterations(cx, cy)
{
    let zx = cx;
    let zy = cy;
    let i = 2;
    while (i < params.maxIterations) {
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
