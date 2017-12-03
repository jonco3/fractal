/*-*- Mode: JS; tab-width: 4 -*-*/

importScripts("common.js");

let colourMap;

function error(message)
{
    postMessage(["error", message]);
    throw message;
}

onmessage = (event) => {
    let args = event.data;
    let message = args.shift();
    switch (message) {
        case "test": {
            break;
        }
        case "plotRegion": {
            assert(args.length === 3, "Bad plotRegion request");
            let region;
            [params, region, colourMap] = args;
            let [buffer, stats] = plotRegion(region);
            postMessage(["plotRegionFinished", region, buffer, stats],
                        [buffer]);
            break;
        }
        case "antialiasRegion": {
            assert(args.length === 4, "Bad antialiasRegion request");
            let region, buffer;
            [params, region, colourMap, buffer] = args;
            let pixelsPlotted = antialiasRegion(region, buffer);
            postMessage(["plotRegionFinished", region, buffer, pixelsPlotted],
                        [buffer]);
            break;
        }
        default: {
            error("Unrecognised request: " + JSON.stringify(event.data));
        }
    }
};

function plotRegion(region)
{
    let [pw, ph] = initRegion(region);
    region = [0, 0, pw, ph];

    let buffer = new ArrayBuffer(pw * ph * 4);
    let iterationData = new Uint32Array(buffer);
    let plot = getPlotterFunc();
    let iterate = getIterationFunc();
    let pixelsPlotted = plot(iterate, region, iterationData, pw);

    let stats = computeStats(region, iterationData, pw, pixelsPlotted);

    let imageData = iterationData;
    colouriseBuffer(iterationData, imageData);

    return [buffer, stats];
}

function antialiasRegion(region, buffer)
{
    let [pw, ph] = initRegion(region);
    region = [0, 0, pw, ph];

    let iterate = getIterationFunc();
    let pixelsPlotted = antialias(iterate, region, buffer, pw);
    return {
        totalPixels: pw * ph,
        pixelsPlotted: pixelsPlotted
    };
}

function initRegion(region)
{
    let [x0, y0, x1, y1] = region;
    assert(x1 > x0 && y1 > y0, "initRegion got bad region");

    updateCoordsScale();
    centrePixelX -= x0;
    centrePixelY -= y0;

    return [x1 - x0, y1 - y0];
}

function getPlotterFunc()
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

function getIterationFunc()
{
    switch (params.fractal.name) {
    case "mandelbrot":
        return mandelbrot;
    case "julia":
        return julia;
    default:
        error("Unknown kind: " + params.fractal.name);
    }
}

function plotAll(iterations, region, buffer, bw)
{
    let [x0, y0, x1, y1] = region;
    for (let py = y0; py < y1; py++) {
        let i = bw * py + x0;
        let cy = complexCoordForPixelY(py);
        for (let px = x0; px < x1; px++) {
            let cx = complexCoordForPixelX(px);
            buffer[i++] = iterations(cx, cy);
        }
    }
    return x1 * y1;
}

function plotFill(iterations, region, buffer, bw) {
    let [x0, y0, x1, y1] = region;

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

    for (px = x0; px < x1; px++) {
        push(px, y0);
        push(px, y1 - 1);
    }
    for (py = y0 + 1; py < y1 - 1; py++) {
        push(x0, py);
        push(x1 - 1, py);
    }

    let pixels = 0;
    while (!empty()) {
        pop();
        let i = px + py * bw;
        if (buffer[i])
            continue;

        let cx = complexCoordForPixelX(px);
        let cy = complexCoordForPixelY(py);
        let r = iterations(cx, cy);
        buffer[i] = r;
        pixels++;

        if (r === 1)
            continue;

        if (px > x0 && buffer[i - 1] === 0)
            push(px - 1, py);
        if (py > y0 && buffer[i - x1] === 0)
            push(px, py - 1);
        if (px < x1 - 1 && buffer[i + 1] === 0)
            push(px + 1, py);
        if (py < y1 - 1 && buffer[i + x1] === 0)
            push(px, py + 1);
    }

    return pixels;
}

function plotDivide(iterations, region, buffer, bw) {
    let [x0, y0, x1, y1] = region;

    let px;
    let py;
    let pixels = 0;

    function maybePlotPixel(px, py, cx, cy) {
        let i = px + py * bw;
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
            let i = x0 + py * bw;
            for (let px = x0; px < x1; px++)
                buffer[i++] = r;
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

    recurse(x0, y0, x1, y1);
    return pixels;
}

function antialias(iterations, region, buffer, bw)
{
    let [x0, y0, x1, y1] = region;

    let imageData = new Uint8ClampedArray(buffer);
    let wordView = new Uint32Array(buffer);

    let subPixelFactor = params.antialias;
    let subPixelScale = coordsScale / subPixelFactor;
    let subPixelOffset = subPixelScale / 2 - coordsScale / 2;
    let subPixelCount = subPixelFactor * subPixelFactor;

    function hasDifferentNeighbour(px, py, i) {
        let v = wordView[i];
        if (px > 0 && wordView[i - 1] !== v)
            return true;
        if (py > 0 && wordView[i - x1] !== v)
            return true;
        if (px < x1 - 1 && wordView[i + 1] !== v)
            return true;
        if (py < y1 - 1 && wordView[i + x1] !== v)
            return true;
        return false;
    }

    let pixelsPlotted = 0;
    let pixelData = new Uint32Array(1);
    let pixelBytes = new Uint8ClampedArray(pixelData.buffer);
    for (let py = 0; py < y1; py++) {
        let i = py * bw + x0;
        for (let px = 0; px < x1; px++) {
            if (hasDifferentNeighbour(px, py, i)) {
                let cy = complexCoordForPixelY(py) + subPixelOffset;
                let tr = 0;
                let tg = 0;
                let tb = 0;
                for (let sy = 0; sy < subPixelFactor; sy++) {
                    let cx = complexCoordForPixelX(px) + subPixelOffset;
                    for (let sx = 0; sx < subPixelFactor; sx++) {
                        let r = iterations(cx, cy);
                        pixelData[0] = colourisePoint(r);
                        tr += pixelBytes[0];
                        tg += pixelBytes[1];
                        tb += pixelBytes[2];
                        cx += subPixelScale;
                    }
                    cy += subPixelScale;
                }
                let j = i * 4;
                imageData[j + 0] = Math.floor(tr / subPixelCount);
                imageData[j + 1] = Math.floor(tg / subPixelCount);
                imageData[j + 2] = Math.floor(tb / subPixelCount);
                pixelsPlotted++;
            }
            i++;
        }
    }
    return pixelsPlotted;
}

function mandelbrot(cx, cy)
{
    // Returns |itererations + 1| or one if the point does not escape.

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

function julia(cx, cy)
{
    // Returns |itererations + 1| or one if the point does not escape.

    let zx = cx;
    let zy = cy;
    let i = 2;
    while (i < params.maxIterations) {
        let xx = zx * zx;
        let yy = zy * zy;
        if (xx + yy >= 4)
            return i;

        zy = 2 * zx * zy + params.fractal.param_cx;
        zx = xx - yy + params.fractal.param_cy;
        i++;
    }

    return 1;
}

function computeStats(region, iterationData, bw, pixelsPlotted)
{
    // Calculate various information about the image including the distribution
    // of iterations required for the neighbours of black pixels. The latter is
    // used to work out whether we should increase the maximum iterations.
    //
    // TODO: We don't use all of this data in the main app although it's useful
    // for testing.

    let [blackPixels, edgePixels, edgeDist] =
        computeEdgeData(region, iterationData, bw);

    let [x0, y0, x1, y1] = region;
    return {
        totalPixels: (x1 - x0) * (y1 - x0),
        pixelsPlotted: pixelsPlotted,
        blackPixels: blackPixels,
        edgePixels: edgePixels,
        edgeDist: edgeDist
    };
}

Math.log2 = Math.log2 || function(x) {
  return Math.log(x) * Math.LOG2E;
};

function computeEdgeData(region, iterationData, bw)
{
    let buckets = Math.round(Math.log2(params.maxIterations));
    let dist = new Array(buckets);
    for (let b = 0; b < buckets; b++)
        dist[b] = 0;

    function hasBlackNeighbour(px, py, i) {
        if (px > x0 && iterationData[i - 1] <= 1)
            return true;
        if (py > y0 && iterationData[i - bw] <= 1)
            return true;
        if (px < x1 - 1 && iterationData[i + 1] <= 1)
            return true;
        if (py < y1 - 1 && iterationData[i + bw] <= 1)
            return true;
    }

    let [x0, y0, x1, y1] = region;
    let blackPixels = 0;
    let edgePixels = 0;
    for (let py = y0; py < y1; py++) {
        let i = py * bw + x0;
        for (let px = x0; px < x1; px++) {
            i++;
            let r = iterationData[i];
            if (r <= 1) {
                blackPixels++;
                continue;
            }

            if (!hasBlackNeighbour(px, py, i))
                continue;

            let b = Math.floor(Math.log2(r - 1));
            dist[b]++;
            edgePixels++;
        }
    }

    return [blackPixels, edgePixels, dist];
}

function colouriseBuffer(iterationData, imageData)
{
    for (let i = 0; i < iterationData.length; i++)
        imageData[i] = colourisePoint(iterationData[i]);
}

function colourisePoint(r)
{
    if (r <= 1)
        return colourMap.data[0];

    if (colourMap.logarithmic)
        r = Math.log2(r);

    r = Math.floor(frac(r * colourMap.scale) * colourMap.size);
    return colourMap.data[r + 1];
}
