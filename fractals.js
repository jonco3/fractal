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
