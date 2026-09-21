import { inferActionName } from './frameImport'
import { uniqueId } from './pathUtils'
import type {
  AssetBundle,
  ImportWarning,
  Rect,
  RegionImportConfig,
  RuntimeImage,
  TextureRef,
} from './types'

export const DEFAULT_REGION_CONFIG: RegionImportConfig = {
  mode: 'auto',
  alphaThreshold: 1,
  backgroundMode: 'transparent',
  backgroundColor: '#000000',
  colorTolerance: 0,
  minRegionWidth: 4,
  minRegionHeight: 4,
  mergeDistance: 2,
  padding: 0,
  frameOrder: 'row-major',
  regions: [],
}

export interface RegionDetectionOptions {
  alphaThreshold: number
  backgroundMode: 'transparent' | 'color'
  backgroundColor: string
  colorTolerance: number
  minRegionWidth: number
  minRegionHeight: number
  mergeDistance: number
  padding: number
}

interface RegionImportInput {
  colorImage: RuntimeImage
  normalImage?: RuntimeImage
  config: RegionImportConfig
}

function parseHexColor(value: string): [number, number, number] {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim())
  if (!match) return [0, 0, 0]
  const hex = match[1].length === 3
    ? match[1].split('').map((character) => character + character).join('')
    : match[1]
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function isForegroundPixel(
  data: Uint8ClampedArray,
  offset: number,
  options: RegionDetectionOptions,
  background: [number, number, number],
): boolean {
  const alpha = data[offset + 3]
  if (alpha < options.alphaThreshold) return false
  if (options.backgroundMode === 'transparent') return true
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  const distance = Math.sqrt(
    (red - background[0]) ** 2 +
      (green - background[1]) ** 2 +
      (blue - background[2]) ** 2,
  )
  return distance > options.colorTolerance
}

function rectanglesAreNear(left: Rect, right: Rect, distance: number): boolean {
  const gapX = Math.max(
    0,
    Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width)),
  )
  const gapY = Math.max(
    0,
    Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height)),
  )
  return Math.hypot(gapX, gapY) <= distance
}

function unionRect(left: Rect, right: Rect): Rect {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  }
}

function mergeNearbyRectangles(rectangles: Rect[], distance: number): Rect[] {
  const result = rectangles.map((rectangle) => ({ ...rectangle }))
  let merged = true
  while (merged) {
    merged = false
    for (let leftIndex = 0; leftIndex < result.length && !merged; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < result.length; rightIndex += 1) {
        if (rectanglesAreNear(result[leftIndex], result[rightIndex], distance)) {
          result[leftIndex] = unionRect(result[leftIndex], result[rightIndex])
          result.splice(rightIndex, 1)
          merged = true
          break
        }
      }
    }
  }
  return result
}

function sortRowMajor(rectangles: Rect[]): Rect[] {
  const medianHeight = [...rectangles]
    .map((rectangle) => rectangle.height)
    .sort((left, right) => left - right)[Math.floor(rectangles.length / 2)] ?? 1
  const tolerance = Math.max(4, medianHeight * 0.5)
  const rows: Array<{ center: number; rectangles: Rect[] }> = []
  for (const rectangle of [...rectangles].sort((left, right) => left.y - right.y)) {
    const center = rectangle.y + rectangle.height / 2
    let row = rows.find((candidate) => Math.abs(candidate.center - center) <= tolerance)
    if (!row) {
      row = { center, rectangles: [] }
      rows.push(row)
    }
    row.rectangles.push(rectangle)
    row.center = row.rectangles.reduce(
      (sum, item) => sum + item.y + item.height / 2,
      0,
    ) / row.rectangles.length
  }
  return rows
    .sort((left, right) => left.center - right.center)
    .flatMap((row) => row.rectangles.sort((left, right) => left.x - right.x))
}

function sortRectangles(rectangles: Rect[], frameOrder: RegionImportConfig['frameOrder']): Rect[] {
  if (frameOrder === 'column-major') {
    return [...rectangles].sort((left, right) =>
      left.x === right.x ? left.y - right.y : left.x - right.x,
    )
  }
  return sortRowMajor(rectangles)
}

export function detectRegionsFromImageData(
  image: ImageData,
  options: RegionDetectionOptions,
): Rect[] {
  const width = image.width
  const height = image.height
  const total = width * height
  const background = parseHexColor(options.backgroundColor)
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  const regions: Rect[] = []

  for (let start = 0; start < total; start += 1) {
    if (visited[start]) continue
    const startOffset = start * 4
    if (!isForegroundPixel(image.data, startOffset, options, background)) {
      visited[start] = 1
      continue
    }

    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue
          const nextX = x + offsetX
          const nextY = y + offsetY
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue
          const nextIndex = nextY * width + nextX
          if (visited[nextIndex]) continue
          visited[nextIndex] = 1
          if (!isForegroundPixel(image.data, nextIndex * 4, options, background)) continue
          queue[tail++] = nextIndex
        }
      }
    }

    const regionWidth = maxX - minX + 1
    const regionHeight = maxY - minY + 1
    if (
      regionWidth >= Math.max(1, options.minRegionWidth) &&
      regionHeight >= Math.max(1, options.minRegionHeight)
    ) {
      regions.push({ x: minX, y: minY, width: regionWidth, height: regionHeight })
    }
  }

  const merged = mergeNearbyRectangles(regions, Math.max(0, options.mergeDistance))
  const padded = merged.map((rectangle) => {
    const x = Math.max(0, rectangle.x - Math.max(0, options.padding))
    const y = Math.max(0, rectangle.y - Math.max(0, options.padding))
    const right = Math.min(width, rectangle.x + rectangle.width + Math.max(0, options.padding))
    const bottom = Math.min(height, rectangle.y + rectangle.height + Math.max(0, options.padding))
    return { x, y, width: right - x, height: bottom - y }
  })
  return sortRectangles(padded, 'row-major')
}

export async function readRegionImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法读取图片像素。')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

export function validateRegionConfig(
  config: RegionImportConfig,
  colorSize: { width: number; height: number },
  normalSize?: { width: number; height: number },
): ImportWarning[] {
  const warnings: ImportWarning[] = []
  if (
    normalSize &&
    (normalSize.width !== colorSize.width || normalSize.height !== colorSize.height)
  ) {
    warnings.push({
      code: 'region-size-mismatch',
      severity: 'error',
      message: `法线图尺寸必须与精灵图完全一致：精灵图 ${colorSize.width}×${colorSize.height}，法线图 ${normalSize.width}×${normalSize.height}。`,
    })
  }
  if (config.regions.length === 0) {
    warnings.push({
      code: 'region-empty',
      severity: 'error',
      message: '至少需要一个有效区域。可以自动检测，也可以手动添加矩形。',
    })
  }
  const invalid = config.regions.some(
    (region) =>
      !Number.isInteger(region.x) ||
      !Number.isInteger(region.y) ||
      !Number.isInteger(region.width) ||
      !Number.isInteger(region.height) ||
      region.width < 1 ||
      region.height < 1 ||
      region.x < 0 ||
      region.y < 0 ||
      region.x + region.width > colorSize.width ||
      region.y + region.height > colorSize.height,
  )
  if (invalid) {
    warnings.push({
      code: 'region-out-of-bounds',
      severity: 'error',
      message: '区域必须是整数，并且不能超出颜色大图范围。',
    })
  }
  return warnings
}

export function createRegionBundle({
  colorImage,
  normalImage,
  config,
}: RegionImportInput): AssetBundle {
  const warnings = validateRegionConfig(
    config,
    { width: colorImage.width, height: colorImage.height },
    normalImage ? { width: normalImage.width, height: normalImage.height } : undefined,
  )
  const errors = warnings.filter((warning) => warning.severity === 'error')
  if (errors.length > 0) {
    throw new Error(errors.map((warning) => warning.message).join(' '))
  }

  const rects = sortRectangles(config.regions, config.frameOrder)
  const frameDigits = String(rects.length).length
  const actionName = inferActionName(colorImage.path || colorImage.name)
  const animationId = uniqueId('clip', `${colorImage.id}:regions:${rects.length}`)
  const frames = rects.map((rect, index) => {
    const number = String(index + 1).padStart(frameDigits, '0')
    const source: TextureRef = {
      id: uniqueId('region-source', `${colorImage.id}:${index}:${rect.x}:${rect.y}`),
      name: `${actionName}_${number}`,
      imageId: colorImage.id,
      path: `${colorImage.path}#region-${index + 1}`,
      rect,
    }
    const normal: TextureRef | undefined = normalImage
      ? {
          id: uniqueId('region-normal', `${normalImage.id}:${index}:${rect.x}:${rect.y}`),
          name: `${actionName}_${number}_n`,
          imageId: normalImage.id,
          path: `${normalImage.path}#region-${index + 1}`,
          rect,
        }
      : undefined
    return {
      id: source.id,
      name: source.name,
      source,
      normal,
      pairingStatus: normal ? ('matched' as const) : ('missing' as const),
    }
  })

  return {
    id: uniqueId('bundle', `${colorImage.id}:regions:${Date.now()}`),
    mode: 'regions',
    sourceName: colorImage.name,
    importedAt: new Date().toISOString(),
    images: normalImage ? [colorImage, normalImage] : [colorImage],
    frames,
    animations: [
      {
        id: animationId,
        name: actionName,
        frameIds: frames.map((frame) => frame.id),
        fps: 8,
        loop: true,
      },
    ],
    normalCandidates: frames.flatMap((frame) => (frame.normal ? [frame.normal] : [])),
    paletteMode: 'fullcolor',
    paletteSources: [],
    regionConfig: { ...config, regions: rects },
    warnings,
  }
}
