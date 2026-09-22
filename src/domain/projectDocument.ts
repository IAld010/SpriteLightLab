import { createDefaultLighting, normalizeLightingState } from './defaults'
import type {
  ActionFrameEvent,
  AssetBundle,
  EditorSettings,
  GridImportConfig,
  LightingState,
  PalettePreset,
  FrameRefinement,
  ProjectDocument,
  RefinementAssetRecord,
  ProjectDocumentV3,
  RegionImportConfig,
  RenderPreferences,
} from './types'

export interface ProjectStateSnapshot {
  projectName: string
  palettePresets: PalettePreset[]
  activePaletteId: string
  lighting: LightingState
  renderPreferences: RenderPreferences
}

export function createProjectDocument(
  bundle: AssetBundle,
  state: ProjectStateSnapshot,
  settings: EditorSettings,
  options: { gridConfig?: GridImportConfig; regionConfig?: RegionImportConfig; refinements?: FrameRefinement[]; frameEvents?: ActionFrameEvent[] } = {},
): ProjectDocumentV3 {
  return {
    version: 3,
    projectName: state.projectName,
    createdAt: new Date().toISOString(),
    sourceMode: bundle.mode,
    sourceName: bundle.sourceName,
    assets: [
      ...bundle.images.map((image) => ({
        path: image.path,
        name: image.name,
        kind: 'image' as const,
      })),
      ...(bundle.metadataFiles ?? []).map((metadata) => ({
        path: metadata.name,
        name: metadata.name,
        kind: 'json' as const,
      })),
    ],
    frames: bundle.frames,
    animations: bundle.animations,
    normalPairing: bundle.frames.map((frame) => ({
      frameId: frame.id,
      normalId: frame.normal?.id,
    })),
    paletteSources: bundle.paletteSources,
    paletteMode: bundle.paletteMode,
    palettePresets: state.palettePresets,
    activePaletteId: state.activePaletteId,
    lighting: state.lighting,
    renderPreferences: state.renderPreferences,
    refinements: options.refinements ?? [],
    frameEvents: options.frameEvents ?? [],
    settings: { ...settings, showRefinement: settings.showRefinement ?? true },
    ...(bundle.gridConfig || options.gridConfig ? { gridConfig: bundle.gridConfig ?? options.gridConfig } : {}),
    ...(bundle.regionConfig || options.regionConfig ? { regionConfig: bundle.regionConfig ?? options.regionConfig } : {}),
  }
}

export function upgradeProjectDocument(document: ProjectDocument): ProjectDocumentV3 {
  if (document.version === 3) {
    return { ...document, refinements: document.refinements ?? [], frameEvents: document.frameEvents ?? [] }
  }
  return {
    ...document,
    version: 3,
    refinements: [],
    frameEvents: [],
  }
}

export function projectStateFromDocument(document: ProjectDocument): ProjectStateSnapshot {
  return {
    projectName: document.projectName || '未命名精灵项目',
    palettePresets: document.palettePresets?.length
      ? document.palettePresets
      : [],
    activePaletteId: document.activePaletteId ?? document.palettePresets?.[0]?.id ?? '',
    lighting: normalizeLightingState(document.lighting ?? createDefaultLighting()),
    renderPreferences:
      document.renderPreferences ?? {
        lightingEnabled: true,
        normalStrength: 1,
        flipGreen: false,
        specularEnabled: false,
        specularStrength: 0.35,
        pixelPerfect: true,
      },
  }
}

export function serializeProjectDocument(document: ProjectDocument): string {
  return `${JSON.stringify(upgradeProjectDocument(document), null, 2)}\n`
}

export function parseProjectDocument(content: string): ProjectDocumentV3 {
  const parsed = JSON.parse(content) as {
    version?: number
    palettePresets?: unknown
    refinements?: unknown
  }
  if (
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
    !Array.isArray(parsed.palettePresets)
  ) {
    throw new Error('项目文件版本或结构不受支持。')
  }
  const upgraded = upgradeProjectDocument(parsed as unknown as ProjectDocument)
  return {
    ...upgraded,
    refinements: Array.isArray(parsed.refinements) ? upgraded.refinements : [],
  }
}

export interface RemappedProjectEditingState {
  refinements: FrameRefinement[]
  refinementAssets: RefinementAssetRecord[]
  frameEvents: ActionFrameEvent[]
}

export function remapProjectEditingState(
  document: ProjectDocument,
  bundle: AssetBundle,
  state: RemappedProjectEditingState,
): RemappedProjectEditingState {
  if (document.version !== 3) return state
  const newFrameByName = new Map(bundle.frames.map((frame) => [frame.name, frame]))
  const frameIdMap = new Map<string, string>()
  for (const oldFrame of document.frames) {
    const newFrame = newFrameByName.get(oldFrame.name)
    if (newFrame) frameIdMap.set(oldFrame.id, newFrame.id)
  }
  const newActionByName = new Map(bundle.animations.map((animation) => [animation.name, animation]))
  const actionIdMap = new Map<string, string>()
  for (const oldAction of document.animations) {
    const newAction = newActionByName.get(oldAction.name)
    if (newAction) actionIdMap.set(oldAction.id, newAction.id)
  }

  return {
    refinements: state.refinements.map((refinement) => {
      const sourceFrameId = frameIdMap.get(refinement.sourceFrameId) ?? refinement.sourceFrameId
      return {
        ...refinement,
        sourceFrameId,
        cels: refinement.cels.map((cel) => ({
          ...cel,
          frameId: sourceFrameId,
        })),
      }
    }),
    refinementAssets: state.refinementAssets.map((asset) => ({
      ...asset,
      frameId: frameIdMap.get(asset.frameId) ?? asset.frameId,
    })),
    frameEvents: state.frameEvents.map((event) => ({
      ...event,
      actionId: actionIdMap.get(event.actionId) ?? event.actionId,
      frameId: frameIdMap.get(event.frameId) ?? event.frameId,
    })),
  }
}

export function applyProjectDocumentToBundle(
  bundle: AssetBundle,
  document: ProjectDocument,
): AssetBundle {
  const documentFrameByName = new Map(document.frames.map((frame) => [frame.name, frame]))
  const candidatesByName = new Map(
    bundle.normalCandidates.map((candidate) => [candidate.name, candidate]),
  )
  const frames = bundle.frames.map((frame) => {
    const documentFrame = documentFrameByName.get(frame.name)
    const matchedCandidate = documentFrame?.normal
      ? candidatesByName.get(documentFrame.normal.name)
      : undefined
    if (!documentFrame) {
      return frame
    }
    return {
      ...frame,
      ...(documentFrame.alignment ? { alignment: documentFrame.alignment } : {}),
      ...(matchedCandidate
        ? {
            normal: matchedCandidate,
            pairingStatus: 'manual' as const,
          }
        : {}),
    }
  })

  const newFrameByName = new Map(frames.map((frame) => [frame.name, frame]))
  const documentFrameById = new Map(document.frames.map((frame) => [frame.id, frame]))
  const animations = document.animations.map((animation) => ({
    ...animation,
    frameIds: animation.frameIds.flatMap((oldFrameId) => {
      const oldFrame = documentFrameById.get(oldFrameId)
      const newFrame = oldFrame ? newFrameByName.get(oldFrame.name) : undefined
      return newFrame ? [newFrame.id] : []
    }),
  }))

  return {
    ...bundle,
    ...(document.version !== 1 && document.gridConfig ? { gridConfig: document.gridConfig } : {}),
    ...(document.version !== 1 && document.regionConfig ? { regionConfig: document.regionConfig } : {}),
    frames,
    animations: animations.some((animation) => animation.frameIds.length > 0)
      ? animations
      : bundle.animations,
  }
}
