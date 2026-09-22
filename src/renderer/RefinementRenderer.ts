import { buildPaletteLut } from '../domain/palette'
import type {
  AssetBundle,
  FrameRefinement,
  LightingState,
  PaletteMode,
  PalettePreset,
  PreviewFrame,
  RenderPreferences,
  RefinementAssetRecord,
  RuntimeImage,
} from '../domain/types'
import { renderCpuSprite } from './CpuSpriteRenderer'

const BLEND_MODE: Record<FrameRefinement['layers'][number]['blendMode'], GlobalCompositeOperation> = {
  normal: 'source-over',
  add: 'lighter',
  multiply: 'multiply',
  screen: 'screen',
}

function frameRect(frame: PreviewFrame, image: RuntimeImage): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: frame.source.rect?.x ?? 0,
    y: frame.source.rect?.y ?? 0,
    width: frame.source.rect?.width ?? image.width,
    height: frame.source.rect?.height ?? image.height,
  }
}

async function imageFileToData(image: RuntimeImage): Promise<ImageData> {
  const bitmap = await createImageBitmap(image.file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Unable to create source canvas.')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, image.width, image.height)
  } finally {
    bitmap.close()
  }
}

function createIndexData(bundle: AssetBundle, color: ImageData): ImageData {
  if (bundle.paletteMode !== 'indexed') {
    return new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1)
  }
  const output = new ImageData(color.width, color.height)
  const indexByColor = new Map<number, number>()
  bundle.paletteSources.forEach((source, index) => {
    const value = Number.parseInt(source.slice(1), 16)
    indexByColor.set(value, Math.min(index, 255))
  })
  for (let offset = 0; offset < color.data.length; offset += 4) {
    const alpha = color.data[offset + 3]
    if (alpha < 8) continue
    const key =
      (color.data[offset] << 16) |
      (color.data[offset + 1] << 8) |
      color.data[offset + 2]
    const index = indexByColor.get(key) ?? 0
    output.data[offset] = index
    output.data[offset + 1] = index
    output.data[offset + 2] = index
    output.data[offset + 3] = alpha
  }
  return output
}

export async function buildRefinementOverlay(
  refinement: FrameRefinement | undefined,
  assets: Record<string, RefinementAssetRecord>,
  width: number,
  height: number,
): Promise<ImageData | undefined> {
  if (!refinement || !refinement.visible || refinement.cels.length === 0) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined
  let hasPixels = false

  for (const layer of refinement.layers) {
    if (!layer.visible) continue
    const cel = refinement.cels.find((candidate) => candidate.layerId === layer.id)
    if (!cel?.bitmapAssetId) continue
    const asset = assets[cel.bitmapAssetId]
    if (!asset) continue
    let bitmap: ImageBitmap | undefined
    try {
      bitmap = await createImageBitmap(asset.blob)
      context.save()
      context.globalAlpha = layer.opacity
      context.globalCompositeOperation = BLEND_MODE[layer.blendMode] ?? 'source-over'
      context.imageSmoothingEnabled = false
      context.drawImage(bitmap, cel.offsetX, cel.offsetY, cel.width, cel.height)
      context.restore()
      hasPixels = true
    } catch {
      context.restore()
    } finally {
      bitmap?.close()
    }
  }

  return hasPixels ? context.getImageData(0, 0, width, height) : undefined
}

export async function renderRefinedFrameCanvas(input: {
  bundle: AssetBundle
  frame: PreviewFrame
  paletteMode: PaletteMode
  paletteSources: string[]
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
  refinement?: FrameRefinement
  refinementAssets?: Record<string, RefinementAssetRecord>
  applyLighting?: boolean
}): Promise<HTMLCanvasElement> {
  const sourceImage = input.bundle.images.find((image) => image.id === input.frame.source.imageId)
  if (!sourceImage) throw new Error(`Missing texture source ${input.frame.source.name}`)
  const rect = frameRect(input.frame, sourceImage)
  const [color, refinementOverlay] = await Promise.all([
    imageFileToData(sourceImage),
    buildRefinementOverlay(
      input.refinement,
      input.refinementAssets ?? {},
      rect.width,
      rect.height,
    ),
  ])
  const index = createIndexData(input.bundle, color)
  return renderCpuSprite({
    color,
    normal: new ImageData(new Uint8ClampedArray([128, 128, 255, 255]), 1, 1),
    index,
    frame: rect,
    outputWidth: rect.width,
    outputHeight: rect.height,
    paletteMode: input.paletteMode,
    paletteSources: input.paletteSources,
    palette: input.palette,
    lighting: input.lighting,
    preferences: {
      ...input.preferences,
      lightingEnabled: input.applyLighting ?? false,
    },
    objectRect: [0, 0, 1, 1],
    refinementOverlay,
    debugNormal: false,
  })
}

export async function renderRawSourceFrameCanvas(input: {
  bundle: AssetBundle
  frame: PreviewFrame
}): Promise<HTMLCanvasElement> {
  const sourceImage = input.bundle.images.find((image) => image.id === input.frame.source.imageId)
  if (!sourceImage) throw new Error(`Missing texture source ${input.frame.source.name}`)
  const rect = frameRect(input.frame, sourceImage)
  const color = await imageFileToData(sourceImage)
  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create source layer copy.')
  context.putImageData(color, -rect.x, -rect.y)
  return canvas
}

export async function renderSourceFrameCanvas(input: {
  bundle: AssetBundle
  frame: PreviewFrame
  paletteMode: PaletteMode
  paletteSources: string[]
  palette: PalettePreset
}): Promise<HTMLCanvasElement> {
  const sourceImage = input.bundle.images.find((image) => image.id === input.frame.source.imageId)
  if (!sourceImage) throw new Error(`Missing texture source ${input.frame.source.name}`)
  const rect = frameRect(input.frame, sourceImage)
  const color = await imageFileToData(sourceImage)
  const index = createIndexData(input.bundle, color)
  return renderCpuSprite({
    color,
    normal: new ImageData(new Uint8ClampedArray([128, 128, 255, 255]), 1, 1),
    index,
    frame: rect,
    outputWidth: rect.width,
    outputHeight: rect.height,
    paletteMode: input.paletteMode,
    paletteSources: input.paletteSources,
    palette: input.palette,
    lighting: { ambientColor: '#ffffff', ambientIntensity: 1, lights: [] },
    preferences: {
      lightingEnabled: false,
      normalStrength: 1,
      flipGreen: false,
      specularEnabled: false,
      specularStrength: 0,
      pixelPerfect: true,
    },
    objectRect: [0, 0, 1, 1],
    debugNormal: false,
  })
}

export function paletteLutPreview(palette: PalettePreset, sources: string[]): Uint8ClampedArray {
  return buildPaletteLut(palette, sources)
}
