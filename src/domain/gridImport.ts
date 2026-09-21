import { inferActionName } from './frameImport'
import { uniqueId } from './pathUtils'
import type {
  AssetBundle,
  GridImportConfig,
  ImportWarning,
  Rect,
  RuntimeImage,
  TextureRef,
} from './types'

export interface GridImageSize {
  width: number
  height: number
}

export function validateGridConfig(
  config: GridImportConfig,
  colorSize: GridImageSize,
  normalSize?: GridImageSize,
): ImportWarning[] {
  const warnings: ImportWarning[] = []
  const positiveIntegers = [
    config.frameWidth,
    config.frameHeight,
    config.columns,
    config.rows,
  ].every((value) => Number.isInteger(value) && value > 0)
  const nonNegativeIntegers = [config.offsetX, config.offsetY, config.spacingX, config.spacingY].every(
    (value) => Number.isInteger(value) && value >= 0,
  )

  if (!positiveIntegers || !nonNegativeIntegers) {
    warnings.push({
      code: 'grid-invalid-config',
      severity: 'error',
      message: '网格参数必须使用正整数；边距和间距不能为负数。',
    })
    return warnings
  }

  if (
    normalSize &&
    (normalSize.width !== colorSize.width || normalSize.height !== colorSize.height)
  ) {
    warnings.push({
      code: 'grid-size-mismatch',
      severity: 'error',
      message: `法线图尺寸必须与精灵图完全一致：精灵图 ${colorSize.width}×${colorSize.height}，法线图 ${normalSize.width}×${normalSize.height}。`,
    })
  }

  const requiredWidth =
    config.offsetX + config.columns * config.frameWidth + (config.columns - 1) * config.spacingX
  const requiredHeight =
    config.offsetY + config.rows * config.frameHeight + (config.rows - 1) * config.spacingY
  if (requiredWidth > colorSize.width || requiredHeight > colorSize.height) {
    warnings.push({
      code: 'grid-out-of-bounds',
      severity: 'error',
      message: `切片区域需要 ${requiredWidth}×${requiredHeight} 像素，但图片只有 ${colorSize.width}×${colorSize.height} 像素。`,
    })
  }

  return warnings
}

export class GridImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GridImportError'
  }
}

export interface GridBundleInput {
  colorImage: RuntimeImage
  normalImage?: RuntimeImage
  config: GridImportConfig
}

export function createGridBundle({ colorImage, normalImage, config }: GridBundleInput): AssetBundle {
  const warnings = validateGridConfig(
    config,
    { width: colorImage.width, height: colorImage.height },
    normalImage ? { width: normalImage.width, height: normalImage.height } : undefined,
  )
  const errors = warnings.filter((warning) => warning.severity === 'error')
  if (errors.length > 0) {
    throw new GridImportError(errors.map((warning) => warning.message).join(' '))
  }

  const rects = createGridRects(config)
  const frameDigits = String(rects.length).length
  const actionName = inferActionName(colorImage.path || colorImage.name)
  const animationId = uniqueId('clip', `${colorImage.id}:${config.frameOrder}:${rects.length}`)
  const frames = rects.map((rect, index) => {
    const number = String(index + 1).padStart(frameDigits, '0')
    const source: TextureRef = {
      id: uniqueId('grid-source', `${colorImage.id}:${index}:${rect.x}:${rect.y}`),
      name: `${actionName}_${number}`,
      imageId: colorImage.id,
      path: `${colorImage.path}#${index + 1}`,
      rect,
    }
    const normal: TextureRef | undefined = normalImage
      ? {
          id: uniqueId('grid-normal', `${normalImage.id}:${index}:${rect.x}:${rect.y}`),
          name: `${actionName}_${number}_n`,
          imageId: normalImage.id,
          path: `${normalImage.path}#${index + 1}`,
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
    id: uniqueId('bundle', `${colorImage.id}:${Date.now()}`),
    mode: 'grid',
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
    gridConfig: config,
    warnings,
  }
}

export function createGridRects(config: GridImportConfig): Rect[] {
  const coordinates: Array<[number, number]> =
    config.frameOrder === 'column-major'
      ? Array.from({ length: config.columns }, (_, column) =>
          Array.from({ length: config.rows }, (_, row) => [column, row] as [number, number]),
        ).flat()
      : Array.from({ length: config.rows }, (_, row) =>
          Array.from({ length: config.columns }, (_, column) => [column, row] as [number, number]),
        ).flat()

  return coordinates.map(([column, row]) => ({
    x: config.offsetX + column * (config.frameWidth + config.spacingX),
    y: config.offsetY + row * (config.frameHeight + config.spacingY),
    width: config.frameWidth,
    height: config.frameHeight,
  }))
}
export async function readGridImageSize(file: File): Promise<GridImageSize> {
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength >= 24) {
    const bytes = new Uint8Array(buffer, 0, 24)
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]
    if (signature.every((value, index) => bytes[index] === value)) {
      const view = new DataView(buffer)
      return {
        width: view.getUint32(16),
        height: view.getUint32(20),
      }
    }
  }

  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }

  throw new Error(`${file.name} 无法读取图片尺寸。`)
}