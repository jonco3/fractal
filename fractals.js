/*-*- Mode: JS; tab-width: 4 -*-*/

const fractals = {
    mandelbrot: {
        func: mandelbrot,
        hasParam: false
    },
    julia: {
        func: julia,
        hasParam: true
    },
    testRects: {
        func: testRects,
        hasParam: false
    }
};

function fractalExists(name) {
    return fractals.hasOwnProperty(name);
}

function fractalHasParam(name) {
    return fractals[name].hasParam;
}

function getIterationFunc()
{
    let name = params.fractal.name;
    if (!fractalExists(name))
        error("Unknown fractal kind: " + name);
    
    return fractals[name].func;
}

function mandelbrot(cx, cy)
{
    // Returns itereration count or zero if the point does not escape.

    let zx = cx;
    let zy = cy;
    let i = 1;
    while (i < params.maxIterations) {
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

function julia(cx, cy)
{
    // Returns itereration count or zero if the point does not escape.

    let zx = cx;
    let zy = cy;
    let i = 1;
    while (i < params.maxIterations) {
        let xx = zx * zx;
        let yy = zy * zy;
        if (xx + yy >= 4)
            return i;

        zy = 2 * zx * zy + params.fractal.param_cx;
        zx = xx - yy + params.fractal.param_cy;
        i++;
    }

    return 0;
}

function testRects(cx, cy)
{
    if (typeof workerColour === "undefined")
        workerColour = Math.floor(Math.random() * 254) + 1;

    return workerColour;
}
