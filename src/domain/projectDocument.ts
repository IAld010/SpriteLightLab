import { createDefaultLighting } from './defaults'
import type {
  AssetBundle,
  EditorSettings,
  LightingState,
  PalettePreset,
  ProjectDocumentV1,
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
): ProjectDocumentV1 {
  return {
    version: 1,
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
    settings,
  }
}

export function projectStateFromDocument(document: ProjectDocumentV1): ProjectStateSnapshot {
  return {
    projectName: document.projectName || '未命名精灵项目',
    palettePresets: document.palettePresets?.length
      ? document.palettePresets
      : [],
    activePaletteId: document.activePaletteId ?? document.palettePresets?.[0]?.id ?? '',
    lighting: document.lighting ?? createDefaultLighting(),
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

export function serializeProjectDocument(document: ProjectDocumentV1): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

export function parseProjectDocument(content: string): ProjectDocumentV1 {
  const parsed = JSON.parse(content) as Partial<ProjectDocumentV1>
  if (parsed.version !== 1 || !Array.isArray(parsed.palettePresets)) {
    throw new Error('项目文件版本或结构不受支持。')
  }
  return parsed as ProjectDocumentV1
}
export function applyProjectDocumentToBundle(
  bundle: AssetBundle,
  document: ProjectDocumentV1,
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
    if (!documentFrame || !matchedCandidate) {
      return frame
    }
    return {
      ...frame,
      normal: matchedCandidate,
      pairingStatus: 'manual' as const,
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
    frames,
    animations: animations.some((animation) => animation.frameIds.length > 0)
      ? animations
      : bundle.animations,
  }
}