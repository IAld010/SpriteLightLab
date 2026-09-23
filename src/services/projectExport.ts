import { computeActionAlignment, resolveFrameAlignment } from '../domain/alignment'
import { computeFrameSchedule } from '../domain/animationTiming'
import { textToBytes } from '../domain/binary'
import {
  atlasFileName,
  buildAtlasDocument,
  buildEngineManifest,
  frameFileName,
  type AtlasExportInput,
  type AtlasFormat,
  type AtlasFrameRecord,
  type EngineManifest,
  type ExportContentMode,
} from '../domain/exportManifest'
import { packSheet } from '../domain/spriteSheet'
import { createZip, type ZipEntry } from '../domain/zip'
import type {
  ActionAlignment,
  ActionFrameEvent,
  AnimationClip,
  AssetBundle,
  FrameAlignment,
  FrameRefinement,
  LightingState,
  PalettePreset,
  PreviewFrame,
  RefinementAssetRecord,
  RenderPreferences,
  RuntimeImage,
} from '../domain/types'
import { renderExportFrame, type ExportLayout } from '../renderer/frameExport'

export type ExportScope = 'frame' | 'action' | 'project'

export interface ExportFrameEntry {
  actionId: string
  actionName: string
  actionLoop: boolean
  frame: PreviewFrame
  frameName: string
  indexInAction: number
  index: number
  durationMs: number
  frameAlignment: FrameAlignment
  frameWidth: number
  frameHeight: number
  actionAlignment?: ActionAlignment
}

export interface ExportPlan {
  projectName: string
  scope: ExportScope
  content: ExportContentMode
  bakePalette: boolean
  bakeLighting: boolean
  layout: ExportLayout
  frames: ExportFrameEntry[]
}

export interface ExportContext {
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
  refinements: Record<string, FrameRefinement>
  refinementAssets: Record<string, RefinementAssetRecord>
  frameEvents: ActionFrameEvent[]
}

export interface ExportFile {
  name: string
  blob: Blob
}

function sourceImageOf(bundle: AssetBundle, frame: PreviewFrame): RuntimeImage | undefined {
  return bundle.images.find((image) => image.id === frame.source.imageId)
}

function frameSize(bundle: AssetBundle, frame: PreviewFrame): { width: number; height: number } {
  const image = sourceImageOf(bundle, frame)
  return {
    width: frame.source.rect?.width ?? image?.width ?? 1,
    height: frame.source.rect?.height ?? image?.height ?? 1,
  }
}

function actionsInScope(bundle: AssetBundle, scope: ExportScope, selectedActionId?: string): AnimationClip[] {
  if (bundle.animations.length === 0) return []
  if (scope === 'project') return bundle.animations
  const action =
    bundle.animations.find((candidate) => candidate.id === selectedActionId) ?? bundle.animations[0]
  return action ? [action] : []
}

export function collectExportPlan(input: {
  bundle: AssetBundle
  projectName: string
  scope: ExportScope
  content: ExportContentMode
  bakePalette: boolean
  bakeLighting: boolean
  layout: ExportLayout
  selectedActionId?: string
  currentFrameId?: string
}): ExportPlan {
  const { bundle } = input
  const frames: ExportFrameEntry[] = []
  let index = 0

  for (const action of actionsInScope(bundle, input.scope, input.selectedActionId)) {
    const actionFrames = action.frameIds.flatMap((frameId) => {
      const frame = bundle.frames.find((candidate) => candidate.id === frameId)
      return frame ? [frame] : []
    })
    if (actionFrames.length === 0) continue
    if (input.scope === 'frame') {
      const frame = actionFrames.find((candidate) => candidate.id === input.currentFrameId) ?? actionFrames[0]
      actionFrames.length = 0
      actionFrames.push(frame)
    }

    const schedule = computeFrameSchedule(action, actionFrames)
    const alignmentInputs = actionFrames.map((frame) => {
      const size = frameSize(bundle, frame)
      return {
        id: frame.id,
        width: size.width,
        height: size.height,
        alignment:
          frame.alignment ?? resolveFrameAlignment(size.width, size.height, 'bottom-center'),
      }
    })
    const actionAlignment = action.alignment ?? computeActionAlignment(alignmentInputs)

    actionFrames.forEach((frame, position) => {
      const size = frameSize(bundle, frame)
      const frameAlignment =
        frame.alignment ?? resolveFrameAlignment(size.width, size.height, 'bottom-center')
      frames.push({
        actionId: action.id,
        actionName: action.name,
        actionLoop: action.loop,
        frame,
        frameName: frame.name,
        indexInAction: position,
        index,
        durationMs: schedule.frames[position]?.durationMs ?? Math.max(1, 1000 / action.fps),
        frameAlignment,
        frameWidth: size.width,
        frameHeight: size.height,
        actionAlignment,
      })
      index += 1
    })
  }

  return {
    projectName: input.projectName,
    scope: input.scope,
    content: input.content,
    bakePalette: input.bakePalette,
    bakeLighting: input.bakeLighting,
    layout: input.layout,
    frames,
  }
}

async function renderPlan(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
  layoutOverride?: ExportLayout,
): Promise<Array<{ entry: ExportFrameEntry; canvas: HTMLCanvasElement }>> {
  const rendered: Array<{ entry: ExportFrameEntry; canvas: HTMLCanvasElement }> = []
  for (const entry of plan.frames) {
    const canvas = await renderExportFrame({
      bundle,
      frame: entry.frame,
      frameAlignment: entry.frameAlignment,
      actionAlignment: entry.actionAlignment,
      palette: context.palette,
      lighting: context.lighting,
      preferences: context.preferences,
      contentMode: plan.content,
      bakePalette: plan.bakePalette,
      bakeLighting: plan.bakeLighting,
      layout: layoutOverride ?? plan.layout,
      refinement: context.refinements[entry.frame.id],
      refinementAssets: context.refinementAssets,
    })
    rendered.push({ entry, canvas })
  }
  return rendered
}

function pngBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/png' })
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((result) => resolve(result ?? undefined), 'image/png')
  })
  if (!blob) throw new Error('无法生成 PNG。')
  return new Uint8Array(await blob.arrayBuffer())
}

function eventNamesFor(context: ExportContext, actionId: string, frameId: string): string[] {
  return context.frameEvents
    .filter((event) => event.actionId === actionId && event.frameId === frameId && event.enabled)
    .map((event) => event.type)
}

function atlasRecords(
  plan: ExportPlan,
  context: ExportContext,
  geometry: (entry: ExportFrameEntry) => { x: number; y: number; width: number; height: number },
): AtlasFrameRecord[] {
  return plan.frames.map((entry) => {
    const rect = geometry(entry)
    return {
      animation: entry.actionName,
      name: entry.frameName,
      durationMs: entry.durationMs,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      pivotX: entry.frameAlignment.pivotX,
      pivotY: entry.frameAlignment.pivotY,
      offsetX: entry.frameAlignment.offsetX,
      offsetY: entry.frameAlignment.offsetY,
      canvasWidth: entry.actionAlignment?.canvasWidth ?? entry.frameWidth,
      canvasHeight: entry.actionAlignment?.canvasHeight ?? entry.frameHeight,
      anchorX: entry.actionAlignment?.anchorX ?? entry.frameWidth / 2,
      anchorY: entry.actionAlignment?.anchorY ?? entry.frameHeight,
      events: eventNamesFor(context, entry.actionId, entry.frame.id),
    }
  })
}

function atlasInput(
  plan: ExportPlan,
  imageFileName: string,
  width: number,
  height: number,
  records: AtlasFrameRecord[],
): AtlasExportInput {
  return {
    projectName: plan.projectName,
    imageFileName,
    sheetWidth: width,
    sheetHeight: height,
    contentMode: plan.content,
    bakedPalette: plan.bakePalette,
    bakedLighting: plan.bakeLighting,
    frames: records,
  }
}

function jsonBlob(value: unknown): Blob {
  return new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' })
}

function zipBlob(entries: ZipEntry[]): Blob {
  const bytes = createZip(entries)
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' })
}

/** PNG sequence per planned frame, plus an engine manifest describing every file. */
export async function exportFrameSequenceZip(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
): Promise<ExportFile> {
  const rendered = await renderPlan(plan, bundle, context)
  const entries: ZipEntry[] = []
  const records: AtlasFrameRecord[] = []

  for (const { entry, canvas } of rendered) {
    const directory = entry.actionName.replaceAll('\\', '/')
    const fileName = frameFileName(entry.indexInAction + 1, entry.frameName)
    entries.push({
      name: `frames/${directory}/${fileName}`,
      data: await canvasToPngBytes(canvas),
    })
    records.push({
      animation: entry.actionName,
      name: entry.frameName,
      durationMs: entry.durationMs,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      pivotX: entry.frameAlignment.pivotX,
      pivotY: entry.frameAlignment.pivotY,
      offsetX: entry.frameAlignment.offsetX,
      offsetY: entry.frameAlignment.offsetY,
      canvasWidth: entry.actionAlignment?.canvasWidth ?? entry.frameWidth,
      canvasHeight: entry.actionAlignment?.canvasHeight ?? entry.frameHeight,
      anchorX: entry.actionAlignment?.anchorX ?? entry.frameWidth / 2,
      anchorY: entry.actionAlignment?.anchorY ?? entry.frameHeight,
      events: eventNamesFor(context, entry.actionId, entry.frame.id),
    })
  }

  const manifest: EngineManifest = buildEngineManifest(atlasInput(plan, '', 0, 0, records))
  entries.push({
    name: 'manifest.json',
    data: textToBytes(`${JSON.stringify(manifest, null, 2)}\n`),
  })

  return {
    name: `${plan.projectName}-sequence.zip`,
    blob: zipBlob(entries),
  }
}

/** Single PNG of the current frame; the plan must contain exactly one frame. */
export async function exportSingleFramePng(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
): Promise<ExportFile[]> {
  const [entry] = plan.frames
  if (!entry) throw new Error('没有可导出的帧。')
  const rendered = await renderPlan({ ...plan, frames: [entry] }, bundle, context)
  const canvas = rendered[0]?.canvas
  if (!canvas) throw new Error('没有可导出的帧。')
  return [
    {
      name: `${plan.projectName}-${frameFileName(entry.indexInAction + 1, entry.frameName)}`,
      blob: pngBlob(await canvasToPngBytes(canvas)),
    },
  ]
}

/** Packed sprite sheet PNG plus atlas JSON of the requested flavour. */
export async function exportSheetBundle(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
  options: { format: AtlasFormat; padding: number; maxWidth: number },
): Promise<ExportFile[]> {
  const rendered = await renderPlan(plan, bundle, context)
  if (rendered.length === 0) {
    throw new Error('没有可导出的帧。')
  }

  const layout = packSheet(
    rendered.map(({ entry, canvas }) => ({
      key: `${entry.index}`,
      width: canvas.width,
      height: canvas.height,
    })),
    { padding: options.padding, maxWidth: options.maxWidth },
  )
  const sheet = document.createElement('canvas')
  sheet.width = layout.width
  sheet.height = layout.height
  const sheetContext = sheet.getContext('2d')
  if (!sheetContext) throw new Error('无法创建图集画布。')
  sheetContext.imageSmoothingEnabled = false

  const placements = new Map(layout.placements.map((placement) => [placement.key, placement]))
  const canvasesByIndex = new Map(rendered.map((item) => [item.entry.index, item.canvas]))
  rendered.forEach(({ entry, canvas }) => {
    const placement = placements.get(`${entry.index}`)
    if (!placement) return
    sheetContext.drawImage(canvas, placement.x, placement.y)
  })

  const sheetName = atlasFileName(plan.projectName)
  const records = atlasRecords(plan, context, (entry) => {
    const canvas = canvasesByIndex.get(entry.index)
    const placement = placements.get(`${entry.index}`)
    return {
      x: placement?.x ?? 0,
      y: placement?.y ?? 0,
      width: canvas?.width ?? entry.frameWidth,
      height: canvas?.height ?? entry.frameHeight,
    }
  })
  const input = atlasInput(plan, sheetName, sheet.width, sheet.height, records)
  const atlasName = `${plan.projectName}-atlas.json`

  return [
    { name: sheetName, blob: pngBlob(await canvasToPngBytes(sheet)) },
    { name: atlasName, blob: jsonBlob(buildAtlasDocument(options.format, input)) },
    { name: `${plan.projectName}-manifest.json`, blob: jsonBlob(buildEngineManifest(input)) },
  ]
}

/** Atlas JSON only, using the frame rects of the per-frame PNG sequence. */
export async function exportAtlasJson(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
  format: AtlasFormat,
): Promise<ExportFile[]> {
  const rendered = await renderPlan(plan, bundle, context)
  const sheetName = atlasFileName(plan.projectName)
  const records = rendered.map(({ entry, canvas }) => ({
    animation: entry.actionName,
    name: entry.frameName,
    durationMs: entry.durationMs,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    pivotX: entry.frameAlignment.pivotX,
    pivotY: entry.frameAlignment.pivotY,
    offsetX: entry.frameAlignment.offsetX,
    offsetY: entry.frameAlignment.offsetY,
    canvasWidth: entry.actionAlignment?.canvasWidth ?? entry.frameWidth,
    canvasHeight: entry.actionAlignment?.canvasHeight ?? entry.frameHeight,
    anchorX: entry.actionAlignment?.anchorX ?? entry.frameWidth / 2,
    anchorY: entry.actionAlignment?.anchorY ?? entry.frameHeight,
    events: eventNamesFor(context, entry.actionId, entry.frame.id),
  }))
  const input = atlasInput(plan, sheetName, 0, 0, records)
  return [{ name: `${plan.projectName}-atlas.json`, blob: jsonBlob(buildAtlasDocument(format, input)) }]
}

/** Engine-neutral metadata document for the current plan. */
export async function exportEngineManifest(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
): Promise<ExportFile[]> {
  const rendered = await renderPlan(plan, bundle, context)
  const sheetName = atlasFileName(plan.projectName)
  const records = rendered.map(({ entry, canvas }) => ({
    animation: entry.actionName,
    name: entry.frameName,
    durationMs: entry.durationMs,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    pivotX: entry.frameAlignment.pivotX,
    pivotY: entry.frameAlignment.pivotY,
    offsetX: entry.frameAlignment.offsetX,
    offsetY: entry.frameAlignment.offsetY,
    canvasWidth: entry.actionAlignment?.canvasWidth ?? entry.frameWidth,
    canvasHeight: entry.actionAlignment?.canvasHeight ?? entry.frameHeight,
    anchorX: entry.actionAlignment?.anchorX ?? entry.frameWidth / 2,
    anchorY: entry.actionAlignment?.anchorY ?? entry.frameHeight,
    events: eventNamesFor(context, entry.actionId, entry.frame.id),
  }))
  return [
    {
      name: `${plan.projectName}-manifest.json`,
      blob: jsonBlob(buildEngineManifest(atlasInput(plan, sheetName, 0, 0, records))),
    },
  ]
}

function imageDataOf(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法读取导出画布。')
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

async function renderAnimationGroups(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
): Promise<Array<{ name: string; frames: Array<{ canvas: HTMLCanvasElement; durationMs: number }> }>> {
  // Animation containers require one uniform frame size, so each action is rendered
  // onto its own logical canvas regardless of the layout switch.
  const groups = new Map<string, Array<{ entry: ExportFrameEntry; canvas: HTMLCanvasElement }>>()
  const rendered = await renderPlan(plan, bundle, context, 'canvas')
  for (const item of rendered) {
    const group = groups.get(item.entry.actionName)
    if (group) group.push(item)
    else groups.set(item.entry.actionName, [item])
  }
  return [...groups].map(([name, items]) => ({
    name,
    frames: items.map((item) => ({
      canvas: item.canvas,
      durationMs: item.entry.durationMs,
    })),
  }))
}

export async function exportAnimation(
  plan: ExportPlan,
  bundle: AssetBundle,
  context: ExportContext,
  format: 'gif' | 'apng',
): Promise<ExportFile[]> {
  const groups = await renderAnimationGroups(plan, bundle, context)
  const files: ExportFile[] = []

  for (const group of groups) {
    if (format === 'apng') {
      const { default: UPNG } = await import('upng-js')
      const width = group.frames[0]?.canvas.width ?? 1
      const height = group.frames[0]?.canvas.height ?? 1
      const buffers = group.frames.map((frame) => {
        const data = imageDataOf(frame.canvas).data
        return data.slice().buffer as ArrayBuffer
      })
      const delays = group.frames.map((frame) => Math.max(10, Math.round(frame.durationMs)))
      const encoded = UPNG.encode(buffers, width, height, 0, delays)
      files.push({
        name: `${plan.projectName}-${group.name}.apng.png`,
        blob: new Blob([encoded], { type: 'image/png' }),
      })
      continue
    }

    const { GIFEncoder, applyPalette, quantize } = await import('gifenc')
    const encoder = GIFEncoder()
    group.frames.forEach((frame, position) => {
      const image = imageDataOf(frame.canvas)
      const palette = quantize(image.data, 255, { format: 'rgba4444' })
      const transparentEntry = [0, 0, 0, 0]
      const fullPalette = [transparentEntry, ...palette]
      const index = applyPalette(image.data, fullPalette, 'rgba4444')
      encoder.writeFrame(index, image.width, image.height, {
        palette: fullPalette,
        delay: Math.max(20, Math.round(frame.durationMs)),
        repeat: 0,
        transparent: true,
        transparentIndex: 0,
        first: position === 0,
      })
    })
    const bytes = encoder.bytes()
    files.push({
      name: `${plan.projectName}-${group.name}.gif`,
      blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' }),
    })
  }

  return files
}

/** Wraps several exported files into a single ZIP so multi-animation exports stay one download. */
export async function packageFilesAsZip(files: ExportFile[], zipName: string): Promise<ExportFile> {
  if (files.length === 1 && files[0]) return files[0]
  const entries: ZipEntry[] = []
  for (const file of files) {
    entries.push({ name: file.name, data: new Uint8Array(await file.blob.arrayBuffer()) })
  }
  return { name: zipName, blob: zipBlob(entries) }
}
