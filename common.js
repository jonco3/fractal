/*-*- Mode: JS; tab-width: 4 -*-*/

// Common code between main page and workers.

let coordsScale;
let centrePixelX;
let centrePixelY;

function updateCoordsScale()
{
    coordsScale = params.coords.size_cy / params.image.height;
    centrePixelX = Math.floor(params.image.width / 2);
    centrePixelY = Math.floor(params.image.height / 2);
}

function complexCoordForPixelX(px)
{
    return params.coords.centre_cx + coordsScale * (px - centrePixelX);
}

function complexCoordForPixelY(py)
{
    return params.coords.centre_cy + coordsScale * (py - centrePixelY);
}
