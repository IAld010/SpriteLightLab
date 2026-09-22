export interface PixelPoint {
  x: number
  y: number
}

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

function normalize(value: number): number {
  return Math.max(0, Math.round(value))
}

export function hexToRgba(color: string, alpha = 255): RgbaColor {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
    a: alpha,
  }
}

export function resizePixel(point: PixelPoint, size: number): PixelPoint[] {
  const pixels: PixelPoint[] = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      pixels.push({
        x: point.x - Math.floor(size / 2) + x,
        y: point.y - Math.floor(size / 2) + y,
      })
    }
  }
  return pixels
}

/** Bresenham line adapted from Piskel's PixelUtils.getLinePixels. */
export function getLinePixels(start: PixelPoint, end: PixelPoint): PixelPoint[] {
  const pixels: PixelPoint[] = []
  let x0 = normalize(start.x)
  let y0 = normalize(start.y)
  const x1 = normalize(end.x)
  const y1 = normalize(end.y)
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let error = dx - dy

  while (true) {
    pixels.push({ x: x0, y: y0 })
    if (x0 === x1 && y0 === y1) break
    const doubled = 2 * error
    if (doubled > -dy) {
      error -= dy
      x0 += sx
    }
    if (doubled < dx) {
      error += dx
      y0 += sy
    }
  }
  return pixels
}

/** Uniform pixel-art line adapted from Piskel's PixelUtils.getUniformLinePixels. */
export function getUniformLinePixels(start: PixelPoint, end: PixelPoint): PixelPoint[] {
  const pixels: PixelPoint[] = []
  const x0 = normalize(start.x)
  const y0 = normalize(start.y)
  const x1 = normalize(end.x)
  const y1 = normalize(end.y)
  const dx = Math.abs(x1 - x0) + 1
  const dy = Math.abs(y1 - y0) + 1
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  const ratio = Math.max(dx, dy) / Math.min(dx, dy)
  let pixelStep = Math.round(ratio) || 0
  if (pixelStep > Math.min(dx, dy)) pixelStep = Number.POSITIVE_INFINITY
  const maxDistance = Math.hypot(x1 - x0, y1 - y0)
  let x = x0
  let y = y0
  let index = 0

  while (true) {
    index += 1
    pixels.push({ x, y })
    if (Math.hypot(x - x0, y - y0) >= maxDistance) break
    const atStep = index % pixelStep === 0
    if (dx >= dy || atStep) x += sx
    if (dy >= dx || atStep) y += sy
  }
  return pixels
}

export function setPixel(
  imageData: ImageData,
  point: PixelPoint,
  color: RgbaColor,
): void {
  const x = Math.round(point.x)
  const y = Math.round(point.y)
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return
  const offset = (y * imageData.width + x) * 4
  imageData.data[offset] = color.r
  imageData.data[offset + 1] = color.g
  imageData.data[offset + 2] = color.b
  imageData.data[offset + 3] = color.a
}

export function stampPixels(
  imageData: ImageData,
  points: readonly PixelPoint[],
  size: number,
  color: RgbaColor,
): void {
  for (const point of points) {
    for (const pixel of resizePixel(point, size)) {
      setPixel(imageData, pixel, color)
    }
  }
}

export function drawLinePixels(
  imageData: ImageData,
  start: PixelPoint,
  end: PixelPoint,
  size: number,
  color: RgbaColor,
  uniform = false,
): void {
  stampPixels(imageData, uniform ? getUniformLinePixels(start, end) : getLinePixels(start, end), size, color)
}

export function drawRectanglePixels(
  imageData: ImageData,
  start: PixelPoint,
  end: PixelPoint,
  size: number,
  color: RgbaColor,
): void {
  const x0 = Math.min(start.x, end.x)
  const x1 = Math.max(start.x, end.x)
  const y0 = Math.min(start.y, end.y)
  const y1 = Math.max(start.y, end.y)
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      if (x > x1 - size || x < x0 + size || y > y1 - size || y < y0 + size) {
        setPixel(imageData, { x, y }, color)
      }
    }
  }
}

/** Pixel ellipse algorithm adapted from Piskel's Circle shape tool. */
export function drawEllipsePixels(
  imageData: ImageData,
  start: PixelPoint,
  end: PixelPoint,
  size: number,
  color: RgbaColor,
): void {
  const x0 = Math.min(start.x, end.x)
  const x1 = Math.max(start.x, end.x)
  const y0 = Math.min(start.y, end.y)
  const y1 = Math.max(start.y, end.y)
  const centerX = Math.round((x0 + x1) / 2)
  const centerY = Math.round((y0 + y1) / 2)
  const radiusX = Math.max(1, x1 - centerX)
  const radiusY = Math.max(1, y1 - centerY)
  const innerX = Math.max(0, radiusX - size)
  const innerY = Math.max(0, radiusY - size)

  for (let x = 0; x <= radiusX; x += 1) {
    for (let y = 0; y <= radiusY; y += 1) {
      const angle = Math.atan2(y, x || 0.0001)
      const radius = Math.hypot(x, y)
      const outerDenominator = Math.sqrt(
        radiusY * radiusY * Math.cos(angle) ** 2 + radiusX * radiusX * Math.sin(angle) ** 2,
      )
      const innerDenominator = Math.sqrt(
        innerY * innerY * Math.cos(angle) ** 2 + innerX * innerX * Math.sin(angle) ** 2,
      )
      const innerLimit = innerX <= 0 || innerY <= 0
        ? 0
        : (innerX * innerY) / Math.max(innerDenominator, 0.0001) + 0.5
      const outerLimit = (radiusX * radiusY) / Math.max(outerDenominator, 0.0001) + 0.5
      if (radius >= innerLimit && radius < outerLimit) {
        setPixel(imageData, { x: centerX + x, y: centerY + y }, color)
        setPixel(imageData, { x: centerX - x, y: centerY + y }, color)
        setPixel(imageData, { x: centerX + x, y: centerY - y }, color)
        setPixel(imageData, { x: centerX - x, y: centerY - y }, color)
      }
    }
  }
}

export function colorAt(imageData: ImageData, point: PixelPoint): RgbaColor | undefined {
  if (point.x < 0 || point.y < 0 || point.x >= imageData.width || point.y >= imageData.height) {
    return undefined
  }
  const offset = (point.y * imageData.width + point.x) * 4
  return {
    r: imageData.data[offset],
    g: imageData.data[offset + 1],
    b: imageData.data[offset + 2],
    a: imageData.data[offset + 3],
  }
}

export function colorsEqual(left: RgbaColor | undefined, right: RgbaColor, tolerance = 0): boolean {
  if (!left) return false
  return (
    Math.abs(left.r - right.r) <= tolerance &&
    Math.abs(left.g - right.g) <= tolerance &&
    Math.abs(left.b - right.b) <= tolerance &&
    Math.abs(left.a - right.a) <= tolerance
  )
}

/** Connected flood fill adapted from Piskel's paintSimilarConnectedPixelsFromFrame. */
export function floodFillPixels(
  imageData: ImageData,
  start: PixelPoint,
  replacement: RgbaColor,
  tolerance = 0,
): boolean {
  const target = colorAt(imageData, start)
  if (!target || colorsEqual(target, replacement, tolerance)) return false
  const visited = new Uint8Array(imageData.width * imageData.height)
  const stack: PixelPoint[] = [start]
  let changed = false

  while (stack.length > 0) {
    const point = stack.pop()!
    const key = point.y * imageData.width + point.x
    if (visited[key]) continue
    visited[key] = 1
    if (!colorsEqual(colorAt(imageData, point), target, tolerance)) continue
    setPixel(imageData, point, replacement)
    changed = true
    if (point.x > 0) stack.push({ x: point.x - 1, y: point.y })
    if (point.x < imageData.width - 1) stack.push({ x: point.x + 1, y: point.y })
    if (point.y > 0) stack.push({ x: point.x, y: point.y - 1 })
    if (point.y < imageData.height - 1) stack.push({ x: point.x, y: point.y + 1 })
  }
  return changed
}
