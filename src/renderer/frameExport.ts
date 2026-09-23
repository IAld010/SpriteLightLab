import { frameCanvasPlacement } from '../domain/alignment'
import type { ExportContentMode } from '../domain/exportManifest'
import type {
  ActionAlignment,
  AssetBundle,
  FrameAlignment,
  FrameRefinement,
  LightingState,
  PalettePreset,
  PreviewFrame,
  RefinementAssetRecord,
  RenderPreferences,
} from '../domain/types'
import { renderCpuSprite } from './CpuSpriteRenderer'
import { buildRefinementOverlay, frameRect, imageFileToData } from './RefinementRenderer'

export type ExportLayout = 'frame' | 'canvas'

export interface FrameExportOptions {
  bundle: AssetBundle
  frame: PreviewFrame
  frameAlignment?: FrameAlignment
  actionAlignment?: ActionAlignment
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
  contentMode: ExportContentMode
  bakePalette: boolean
  bakeLighting: boolean
  layout: ExportLayout
  refinement?: FrameRefinement
  refinementAssets?: Record<string, RefinementAssetRecord>
}

function flatNormalImageData(width: number, height: number): ImageData {
  const image = new ImageData(Math.max(1, width), Math.max(1, height))
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 128
    image.data[offset + 1] = 128
    image.data[offset + 2] = 255
    image.data[offset + 3] = 255
  }
  return image
}

/** Neutral palette used when Palette Swap must not be baked into the export. */
export function identityPalette(): PalettePreset {
  return {
    id: 'export-identity',
    name: 'identity',
    entries: [],
    rules: [],
    adjustments: {
      hue: 0,
      saturation: 1,
      lightness: 0,
      contrast: 1,
      tint: '#ffffff',
      tintStrength: 0,
    },
  }
}

/**
 * Renders one frame for export. Content modes mirror the editor rules:
 * source = original pixels, composited = refinement over source, refinement = refinement only.
 * Lighting is only baked where the source frame is opaque, matching the editor pipeline.
 */
export async function renderExportFrame(options: FrameExportOptions): Promise<HTMLCanvasElement> {
  const { bundle, frame, contentMode } = options
  const sourceImage = bundle.images.find((image) => image.id === frame.source.imageId)
  if (!sourceImage) {
    throw new Error(`Missing texture source ${frame.source.name}`)
  }
  const rect = frameRect(frame, sourceImage)
  const normalImage = frame.normal
    ? bundle.images.find((image) => image.id === frame.normal?.imageId)
    : undefined
  const bakeLighting = options.bakeLighting && Boolean(normalImage)
  const overlayRequested = contentMode !== 'source'

  const [color, normal, refinementOverlay] = await Promise.all([
    imageFileToData(sourceImage),
    normalImage ? imageFileToData(normalImage) : Promise.resolve(flatNormalImageData(rect.width, rect.height)),
    overlayRequested
      ? buildRefinementOverlay(
          options.refinement,
          options.refinementAssets ?? {},
          rect.width,
          rect.height,
        )
      : Promise.resolve(undefined),
  ])

  const bakePalette = options.bakePalette && contentMode !== 'refinement'
  const frameCanvas = renderCpuSprite({
    color,
    normal,
    index: new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1),
    frame: rect,
    outputWidth: rect.width,
    outputHeight: rect.height,
    paletteMode: bakePalette ? bundle.paletteMode : 'fullcolor',
    paletteSources: bundle.paletteSources,
    palette: bakePalette ? options.palette : identityPalette(),
    lighting: options.lighting,
    preferences: { ...options.preferences, lightingEnabled: bakeLighting },
    objectRect: [0, 0, 1, 1],
    refinementOverlay,
    sourceVisible: contentMode !== 'refinement',
    debugNormal: false,
  })

  if (options.layout === 'frame' || !options.actionAlignment) {
    return frameCanvas
  }

  const placement = frameCanvasPlacement(
    {
      width: rect.width,
      height: rect.height,
      alignment:
        options.frameAlignment ??
        ({ pivotX: rect.width / 2, pivotY: rect.height, offsetX: 0, offsetY: 0 } satisfies FrameAlignment),
    },
    options.actionAlignment,
  )
  return placeOnCanvas(frameCanvas, placement, options.actionAlignment)
}

function placeOnCanvas(
  source: HTMLCanvasElement,
  placement: { x: number; y: number },
  alignment: ActionAlignment,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, alignment.canvasWidth)
  canvas.height = Math.max(1, alignment.canvasHeight)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create export canvas.')
  context.imageSmoothingEnabled = false
  context.drawImage(source, Math.round(placement.x), Math.round(placement.y))
  return canvas
}
