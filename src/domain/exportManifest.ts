export type ExportContentMode = 'source' | 'composited' | 'refinement'

export type AtlasFormat = 'generic' | 'aseprite' | 'texturepacker'

export interface AtlasFrameRecord {
  animation: string
  name: string
  durationMs: number
  x: number
  y: number
  width: number
  height: number
  pivotX: number
  pivotY: number
  offsetX: number
  offsetY: number
  canvasWidth: number
  canvasHeight: number
  anchorX: number
  anchorY: number
  events: string[]
}

export interface AtlasExportInput {
  projectName: string
  imageFileName: string
  sheetWidth: number
  sheetHeight: number
  contentMode: ExportContentMode
  bakedPalette: boolean
  bakedLighting: boolean
  frames: AtlasFrameRecord[]
}

export interface EngineManifestFrame {
  name: string
  durationMs: number
  rect: { x: number; y: number; width: number; height: number }
  pivot: { x: number; y: number }
  offset: { x: number; y: number }
  canvas: { width: number; height: number; anchorX: number; anchorY: number }
  events: string[]
}

export interface EngineManifestAnimation {
  name: string
  frameCount: number
  durationMs: number
  frames: EngineManifestFrame[]
}

export interface EngineManifest {
  format: 'sprite-light-lab-manifest'
  version: 1
  projectName: string
  image: string
  sheet: { width: number; height: number }
  content: ExportContentMode
  baked: { palette: boolean; lighting: boolean }
  animations: EngineManifestAnimation[]
}

function frameKey(frame: AtlasFrameRecord): string {
  return `${frame.animation}/${frame.name}`.replaceAll('\\', '/')
}

function groupByAnimation(frames: AtlasFrameRecord[]): Map<string, AtlasFrameRecord[]> {
  const groups = new Map<string, AtlasFrameRecord[]>()
  for (const frame of frames) {
    const group = groups.get(frame.animation)
    if (group) {
      group.push(frame)
    } else {
      groups.set(frame.animation, [frame])
    }
  }
  return groups
}

function exportContext(input: AtlasExportInput) {
  return {
    content: input.contentMode,
    baked: { palette: input.bakedPalette, lighting: input.bakedLighting },
  }
}

export function buildGenericAtlas(input: AtlasExportInput): Record<string, unknown> {
  return {
    format: 'sprite-light-lab-atlas',
    version: 1,
    projectName: input.projectName,
    image: input.imageFileName,
    size: { width: input.sheetWidth, height: input.sheetHeight },
    ...exportContext(input),
    frames: input.frames.map((frame) => ({
      animation: frame.animation,
      name: frame.name,
      durationMs: frame.durationMs,
      frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      pivot: { x: frame.pivotX, y: frame.pivotY },
      offset: { x: frame.offsetX, y: frame.offsetY },
      canvas: {
        width: frame.canvasWidth,
        height: frame.canvasHeight,
        anchorX: frame.anchorX,
        anchorY: frame.anchorY,
      },
      events: frame.events,
    })),
  }
}

export function buildAsepriteAtlas(input: AtlasExportInput): Record<string, unknown> {
  const frames: Record<string, unknown> = {}
  for (const frame of input.frames) {
    frames[frameKey(frame)] = {
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.canvasWidth, h: frame.canvasHeight },
      duration: Math.max(1, Math.round(frame.durationMs)),
    }
  }

  let cursor = 0
  const frameTags = [...groupByAnimation(input.frames)].map(([name, group]) => {
    const tag = { name, from: cursor, to: cursor + group.length - 1, direction: 'forward' as const }
    cursor += group.length
    return tag
  })

  return {
    frames,
    meta: {
      app: 'https://github.com/IAld010/SpriteLightLab',
      version: '1.0',
      image: input.imageFileName,
      format: 'RGBA8888',
      size: { w: input.sheetWidth, h: input.sheetHeight },
      scale: '1',
      ...exportContext(input),
      frameTags,
      layers: [{ name: 'Sprite', opacity: 255, blendMode: 'normal' }],
      slices: [],
    },
  }
}

export function buildTexturePackerAtlas(input: AtlasExportInput): Record<string, unknown> {
  const frames: Record<string, unknown> = {}
  for (const frame of input.frames) {
    frames[frameKey(frame)] = {
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.canvasWidth, h: frame.canvasHeight },
      pivot: {
        x: frame.width > 0 ? frame.pivotX / frame.width : 0.5,
        y: frame.height > 0 ? frame.pivotY / frame.height : 0.5,
      },
    }
  }

  return {
    frames,
    meta: {
      app: 'SpriteLightLab',
      version: '1.0',
      image: input.imageFileName,
      format: 'RGBA8888',
      size: { w: input.sheetWidth, h: input.sheetHeight },
      scale: '1',
      smartupdate: '',
      ...exportContext(input),
    },
  }
}

export function buildEngineManifest(input: AtlasExportInput): EngineManifest {
  const animations: EngineManifestAnimation[] = [...groupByAnimation(input.frames)].map(
    ([name, group]) => ({
      name,
      frameCount: group.length,
      durationMs: group.reduce((sum, frame) => sum + Math.max(0, frame.durationMs), 0),
      frames: group.map((frame) => ({
        name: frame.name,
        durationMs: frame.durationMs,
        rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        pivot: { x: frame.pivotX, y: frame.pivotY },
        offset: { x: frame.offsetX, y: frame.offsetY },
        canvas: {
          width: frame.canvasWidth,
          height: frame.canvasHeight,
          anchorX: frame.anchorX,
          anchorY: frame.anchorY,
        },
        events: frame.events,
      })),
    }),
  )

  return {
    format: 'sprite-light-lab-manifest',
    version: 1,
    projectName: input.projectName,
    image: input.imageFileName,
    sheet: { width: input.sheetWidth, height: input.sheetHeight },
    content: input.contentMode,
    baked: { palette: input.bakedPalette, lighting: input.bakedLighting },
    animations,
  }
}

export function buildAtlasDocument(format: AtlasFormat, input: AtlasExportInput): Record<string, unknown> {
  if (format === 'aseprite') return buildAsepriteAtlas(input)
  if (format === 'texturepacker') return buildTexturePackerAtlas(input)
  return buildGenericAtlas(input)
}

function padIndex(index: number): string {
  return String(index).padStart(4, '0')
}

function sanitizeSegment(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '-')
  return cleaned.length > 0 ? cleaned : 'sprite'
}

export function frameFileName(index: number, frameName: string): string {
  return `${padIndex(index)}_${sanitizeSegment(frameName)}.png`
}

export function atlasFileName(projectName: string, animationName?: string): string {
  const base = sanitizeSegment(projectName)
  return animationName ? `${base}-${sanitizeSegment(animationName)}.png` : `${base}-sheet.png`
}
