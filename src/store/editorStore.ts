import { create } from 'zustand'
import { computeActionAlignment, resolveFrameAlignment } from '../domain/alignment'
import { normalizeSpeedCurve } from '../domain/animationTiming'
import { createDemoFiles, createFullColorDemoFiles } from '../demo/createDemoFiles'
import { importProjectZip } from '../services/projectIO'
import { createProjectId } from '../services/projectPersistence'
import { useProjectStore } from './projectStore'
import { useRefinementStore } from './refinementStore'
import {
  applyProjectDocumentToBundle,
  projectStateFromDocument,
} from '../domain/projectDocument'
import {
  ImportError,
  collectCurrentWarnings,
  importFiles as importAssetFiles,
  importGridFiles as importGridAssetFiles,
  importRegionFiles as importRegionAssetFiles,
  updateFrameNormal,
} from '../domain/importAssets'
import type {
  ActionAlignment,
  AnchorPreset,
  AnchorSnapMode,
  AnimationClip,
  AssetBundle,
  BackendPreference,
  EditorSettings,
  FrameAlignment,
  GridImportConfig,
  ImportWarning,
  PreviewBackground,
  PreviewTextureMode,
  ProjectDocument,
  RefinementAssetRecord,
  RegionImportConfig,
  SpeedCurve,
  TextureRef,
} from '../domain/types'

export interface EditorNotice {
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface ProjectSession {
  projectId: string
  createdAt: string
}

interface EditorState {
  bundle?: AssetBundle
  projectId?: string
  projectCreatedAt?: string
  warnings: ImportWarning[]
  selectedActionId?: string
  currentFrameIndex: number
  isPlaying: boolean
  isImporting: boolean
  anchorCalibrationEnabled: boolean
  anchorCalibrationZoom: number
  anchorGridVisible: boolean
  anchorOnionSkin: boolean
  anchorSnapMode: AnchorSnapMode
  settings: EditorSettings
  notice?: EditorNotice
  importLocalFiles: (files: File[]) => Promise<void>
  importGridFiles: (
    colorFile: File,
    normalFile: File | undefined,
    config: GridImportConfig,
  ) => Promise<boolean>
  importRegionFiles: (
    colorFile: File,
    normalFile: File | undefined,
    config: RegionImportConfig,
  ) => Promise<boolean>
  importProjectFiles: (
    files: File[],
    document: ProjectDocument,
    session?: ProjectSession,
    refinementAssets?: RefinementAssetRecord[],
  ) => Promise<void>
  applyProjectDocument: (document: ProjectDocument) => void
  clearProject: () => void
  commitImportedBundle: (bundle: AssetBundle) => void
  loadDemo: () => Promise<void>
  loadFullColorDemo: () => Promise<void>
  loadDefoldSample: () => Promise<void>
  selectAction: (actionId: string) => void
  selectFrame: (frameId: string) => void
  stepFrame: (delta: number) => void
  advanceFrame: () => void
  setPlaying: (playing: boolean) => void
  toggleLoop: () => void
  setFps: (fps: number) => void
  updateSpeedCurve: (actionId: string, curve: SpeedCurve) => void
  renameAction: (actionId: string, name: string) => void
  reorderFrames: (actionId: string, fromIndex: number, toIndex: number) => void
  setAnchorCalibrationEnabled: (enabled: boolean) => void
  setAnchorCalibrationZoom: (zoom: number) => void
  setAnchorGridVisible: (visible: boolean) => void
  setAnchorOnionSkin: (visible: boolean) => void
  setAnchorSnapMode: (mode: AnchorSnapMode) => void
  updateFrameAlignment: (frameId: string, patch: Partial<FrameAlignment>) => void
  updateActionAlignment: (patch: Partial<ActionAlignment>) => void
  applyAnchorPresetToAll: (preset: AnchorPreset) => void
  pairNormal: (frameId: string, candidate?: TextureRef) => void
  setBackend: (backend: BackendPreference) => void
  setTextureMode: (mode: PreviewTextureMode) => void
  setBackground: (background: PreviewBackground) => void
  setShowRefinement: (visible: boolean) => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  resetView: () => void
  setNotice: (notice: EditorNotice) => void
  dismissNotice: () => void
}

function mergeSettings(base: EditorSettings, imported?: Partial<EditorSettings>): EditorSettings {
  return {
    backend: imported?.backend ?? base.backend,
    textureMode: imported?.textureMode ?? base.textureMode,
    background: imported?.background ?? base.background,
    zoom: imported?.zoom ?? 1,
    panX: imported?.panX ?? 0,
    panY: imported?.panY ?? 0,
    showRefinement: imported?.showRefinement ?? true,
  }
}

function cropFilesFromDocument(
  files: File[],
  document: ProjectDocument,
): { colorFile: File; normalFile?: File } | undefined {
  if (document.version === 1 || (!document.gridConfig && !document.regionConfig)) {
    return undefined
  }
  const imageAssets = document.assets.filter((asset) => asset.kind === 'image')
  const colorAsset =
    imageAssets.find((asset) => asset.name === document.sourceName) ?? imageAssets[0]
  if (!colorAsset) {
    return undefined
  }
  const normalAsset = imageAssets.find((asset) => asset !== colorAsset)
  const colorFile = files.find((file) => file.name === colorAsset.name)
  if (!colorFile) {
    return undefined
  }
  return {
    colorFile,
    normalFile: normalAsset
      ? files.find((file) => file.name === normalAsset.name)
      : undefined,
  }
}
function selectedActionFor(bundle: AssetBundle, actionId?: string): AnimationClip | undefined {
  return bundle.animations.find((animation) => animation.id === actionId) ?? bundle.animations[0]
}

function frameDimensions(bundle: AssetBundle, frameId: string): { width: number; height: number } {
  const frame = bundle.frames.find((candidate) => candidate.id === frameId)
  if (!frame) return { width: 1, height: 1 }
  const image = bundle.images.find((candidate) => candidate.id === frame.source.imageId)
  return {
    width: frame.source.rect?.width ?? image?.width ?? 1,
    height: frame.source.rect?.height ?? image?.height ?? 1,
  }
}

function ensureActionAlignment(bundle: AssetBundle, actionId?: string): AssetBundle {
  const action = selectedActionFor(bundle, actionId)
  if (!action) return bundle
  const actionFrameIds = new Set(action.frameIds)
  const frames = bundle.frames.map((frame) => {
    if (!actionFrameIds.has(frame.id)) return frame
    const dimensions = frameDimensions(bundle, frame.id)
    return {
      ...frame,
      alignment: frame.alignment ?? resolveFrameAlignment(dimensions.width, dimensions.height, 'bottom-center'),
    }
  })
  const alignedFrames = frames
    .filter((frame) => actionFrameIds.has(frame.id))
    .map((frame) => {
      const dimensions = frameDimensions(bundle, frame.id)
      return {
        id: frame.id,
        width: dimensions.width,
        height: dimensions.height,
        alignment: frame.alignment ?? resolveFrameAlignment(dimensions.width, dimensions.height, 'bottom-center'),
      }
    })
  const alignment = computeActionAlignment(alignedFrames)
  return {
    ...bundle,
    frames,
    animations: bundle.animations.map((animation) =>
      animation.id === action.id ? { ...animation, alignment } : animation,
    ),
  }
}

function recalculateActionAlignment(bundle: AssetBundle, actionId?: string): AssetBundle {
  return ensureActionAlignment(bundle, actionId)
}

export const useEditorStore = create<EditorState>((set, get) => ({
  warnings: [],
  currentFrameIndex: 0,
  isPlaying: false,
  isImporting: false,
  anchorCalibrationEnabled: false,
  anchorCalibrationZoom: 8,
  anchorGridVisible: true,
  anchorOnionSkin: true,
  anchorSnapMode: 'pixel-center',
  settings: {
    backend: 'webgl',
    textureMode: 'color',
    background: 'checker',
    zoom: 1,
    panX: 0,
    panY: 0,
  },

  commitImportedBundle: (bundle) => {
    const warnings = collectCurrentWarnings(bundle)
    const projectId = createProjectId()
    useProjectStore.getState().initializeFromBundle(bundle)
    set({
      bundle,
      projectId,
      projectCreatedAt: new Date().toISOString(),
      warnings,
      selectedActionId: bundle.animations[0]?.id,
      currentFrameIndex: 0,
      isPlaying: false,
      isImporting: false,
      anchorCalibrationEnabled: false,
      notice: {
        tone: warnings.some((warning) => warning.severity === 'error') ? 'warning' : 'success',
        message: `已导入 ${bundle.frames.length} 帧、${bundle.animations.length} 个动作。`,
      },
    })
    useRefinementStore.getState().initialize(projectId, [], [])
  },
  importLocalFiles: async (files) => {
    if (files.length === 0) {
      return
    }
    set({ isImporting: true, notice: { tone: 'info', message: '正在解析素材…' } })
    try {
      const bundle = await importAssetFiles(files)
      const warnings = collectCurrentWarnings(bundle)
      const projectId = createProjectId()
      const projectCreatedAt = new Date().toISOString()
      useRefinementStore.getState().initialize(projectId, [], [])
      useProjectStore.getState().initializeFromBundle(bundle)
      set({
        bundle,
        projectId,
        projectCreatedAt,
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: false,
        isImporting: false,
        anchorCalibrationEnabled: false,
        notice: {
          tone: warnings.some((warning) => warning.severity === 'error') ? 'warning' : 'success',
          message: `已导入 ${bundle.frames.length} 帧、${bundle.animations.length} 个动作。`,
        },
      })
    } catch (error) {
      set({
        isImporting: false,
        notice: {
          tone: 'error',
          message: error instanceof ImportError ? error.message : '素材导入失败，请检查文件格式。',
        },
      })
    }
  },

  importGridFiles: async (colorFile, normalFile, config) => {
    set({ isImporting: true, notice: { tone: 'info', message: '正在按网格切图…' } })
    try {
      const bundle = await importGridAssetFiles(colorFile, normalFile, config)
      const warnings = collectCurrentWarnings(bundle)
      const projectId = createProjectId()
      const projectCreatedAt = new Date().toISOString()
      useRefinementStore.getState().initialize(projectId, [], [])
      useProjectStore.getState().initializeFromBundle(bundle)
      set({
        bundle,
        projectId,
        projectCreatedAt,
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: false,
        isImporting: false,
        anchorCalibrationEnabled: false,
        notice: {
          tone: warnings.some((warning) => warning.severity === 'error') ? 'warning' : 'success',
          message: `网格导入完成：${bundle.frames.length} 帧、${bundle.animations.length} 个动作。`,
        },
      })
      return true
    } catch (error) {
      set({
        isImporting: false,
        notice: {
          tone: 'error',
          message: error instanceof Error ? error.message : '网格切图失败，请检查参数。',
        },
      })
      return false
    }
  },
  importProjectFiles: async (files, document, session, refinementAssets) => {
    if (files.length === 0) {
      return
    }
    set({ isImporting: true, notice: { tone: 'info', message: '\u6b63\u5728\u6062\u590d\u9879\u76ee\u4e0e\u7d20\u6750\u2026' } })
    try {
      const cropFiles = cropFilesFromDocument(files, document)
      const imported =
        cropFiles && document.version !== 1 && document.regionConfig
          ? await importRegionAssetFiles(cropFiles.colorFile, cropFiles.normalFile, document.regionConfig)
          : cropFiles && document.version !== 1 && document.gridConfig
            ? await importGridAssetFiles(cropFiles.colorFile, cropFiles.normalFile, document.gridConfig)
            : await importAssetFiles(files)
      const bundle = applyProjectDocumentToBundle(imported, document)
      useProjectStore.getState().applyProjectState(projectStateFromDocument(document))
      const warnings = collectCurrentWarnings(bundle)
      const projectId = session?.projectId ?? createProjectId()
      useRefinementStore.getState().initialize(
        projectId,
        document.version === 3 ? document.refinements : [],
        refinementAssets ?? [],
      )
      set({
        bundle,
        projectId,
        projectCreatedAt: session?.createdAt ?? new Date().toISOString(),
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: false,
        isImporting: false,
        anchorCalibrationEnabled: false,
        settings: mergeSettings(get().settings, document.settings),
        notice: { tone: 'success', message: '\u9879\u76ee\u4e0e\u7d20\u6750\u5df2\u6062\u590d\u3002' },
      })
    } catch (error) {
      set({
        isImporting: false,
        notice: {
          tone: 'error',
          message: error instanceof Error ? error.message : '\u9879\u76ee\u6062\u590d\u5931\u8d25\u3002',
        },
      })
    }
  },

  applyProjectDocument: (document) => {
    const bundle = get().bundle
    if (!bundle) {
      set({ notice: { tone: 'warning', message: '\u8bf7\u5148\u5bfc\u5165\u5339\u914d\u7684\u7d20\u6750\uff0c\u518d\u8f7d\u5165\u8f7b\u91cf\u9879\u76ee\u914d\u7f6e\u3002' } })
      return
    }
    const nextBundle = applyProjectDocumentToBundle(bundle, document)
    useProjectStore.getState().applyProjectState(projectStateFromDocument(document))
    useRefinementStore.getState().initialize(
      get().projectId,
      document.version === 3 ? document.refinements : [],
      [],
    )
    set({
      bundle: nextBundle,
      warnings: collectCurrentWarnings(nextBundle),
      selectedActionId: nextBundle.animations[0]?.id,
      currentFrameIndex: 0,
      isPlaying: false,
      anchorCalibrationEnabled: false,
      settings: mergeSettings(get().settings, document.settings),
      notice: { tone: 'success', message: '\u9879\u76ee\u914d\u7f6e\u5df2\u5e94\u7528\u5230\u5f53\u524d\u7d20\u6750\u3002' },
    })
  },

  clearProject: () => {
    useRefinementStore.getState().reset()
    set({
      bundle: undefined,
      projectId: undefined,
      projectCreatedAt: undefined,
      warnings: [],
      selectedActionId: undefined,
      currentFrameIndex: 0,
      anchorCalibrationEnabled: false,
      isPlaying: false,
      isImporting: false,
      notice: undefined,
    })
  },

  loadDemo: async () => {
    const files = await createDemoFiles()
    await get().importLocalFiles(files)
  },

  loadFullColorDemo: async () => {
    const files = await createFullColorDemoFiles()
    await get().importLocalFiles(files)
  },

  loadDefoldSample: async () => {
    set({ isImporting: true, notice: { tone: 'info', message: '\u6b63\u5728\u8f7d\u5165 Defold \u793a\u4f8b\u2026' } })
    try {
      const response = await fetch('/samples/sample-normal-maps-2d.spritelab.zip')
      if (!response.ok) {
        throw new Error('\u65e0\u6cd5\u8bfb\u53d6\u5185\u7f6e\u793a\u4f8b\u9879\u76ee\u3002')
      }
      const portable = await importProjectZip(await response.arrayBuffer())
      await get().importProjectFiles(portable.files, portable.document, undefined, portable.refinementAssets)
    } catch (error) {
      set({
        isImporting: false,
        notice: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Defold \u793a\u4f8b\u8f7d\u5165\u5931\u8d25\u3002',
        },
      })
    }
  },

  selectAction: (actionId) => {
    const state = get()
    const action = state.bundle ? selectedActionFor(state.bundle, actionId) : undefined
    const bundle =
      state.bundle && state.anchorCalibrationEnabled
        ? ensureActionAlignment(state.bundle, action?.id)
        : state.bundle
    set({
      bundle,
      selectedActionId: action?.id,
      currentFrameIndex: 0,
      isPlaying: false,
    })
  },

  selectFrame: (frameId) => {
    const state = get()
    const action = state.bundle
      ? selectedActionFor(state.bundle, state.selectedActionId)
      : undefined
    const index = action?.frameIds.indexOf(frameId) ?? -1
    if (index >= 0) {
      set({ currentFrameIndex: index, isPlaying: false })
    }
  },

  stepFrame: (delta) => {
    const state = get()
    const action = state.bundle
      ? selectedActionFor(state.bundle, state.selectedActionId)
      : undefined
    if (!action || action.frameIds.length === 0) {
      return
    }
    const nextIndex =
      (state.currentFrameIndex + delta + action.frameIds.length) % action.frameIds.length
    set({ currentFrameIndex: nextIndex, isPlaying: false })
  },

  advanceFrame: () => {
    const state = get()
    const action = state.bundle
      ? selectedActionFor(state.bundle, state.selectedActionId)
      : undefined
    if (!action || action.frameIds.length === 0) {
      return
    }
    const nextIndex = state.currentFrameIndex + 1
    if (nextIndex >= action.frameIds.length) {
      if (!action.loop) {
        set({ isPlaying: false })
        return
      }
      set({ currentFrameIndex: 0 })
      return
    }
    set({ currentFrameIndex: nextIndex })
  },

  setPlaying: (isPlaying) => set({ isPlaying }),
  toggleLoop: () => {
    const state = get()
    const action = state.bundle
      ? selectedActionFor(state.bundle, state.selectedActionId)
      : undefined
    if (!action || !state.bundle) {
      return
    }
    const animations = state.bundle.animations.map((animation) =>
      animation.id === action.id ? { ...animation, loop: !animation.loop } : animation,
    )
    set({ bundle: { ...state.bundle, animations } })
  },

  setFps: (fps) => {
    const state = get()
    const action = state.bundle
      ? selectedActionFor(state.bundle, state.selectedActionId)
      : undefined
    const safeFps = Math.max(1, Math.min(60, Math.round(fps)))
    if (!action || !state.bundle) {
      return
    }
    const animations = state.bundle.animations.map((animation) =>
      animation.id === action.id ? { ...animation, fps: safeFps } : animation,
    )
    set({ bundle: { ...state.bundle, animations } })
  },

  updateSpeedCurve: (actionId, curve) => {
    const { bundle } = get()
    if (!bundle) {
      return
    }
    const animations = bundle.animations.map((animation) =>
      animation.id === actionId
        ? { ...animation, timing: { speedCurve: normalizeSpeedCurve(curve) } }
        : animation,
    )
    set({ bundle: { ...bundle, animations } })
  },
  renameAction: (actionId, name) => {
    const trimmed = name.trim()
    const { bundle } = get()
    if (!bundle || !trimmed) {
      return
    }
    const animations = bundle.animations.map((animation) =>
      animation.id === actionId ? { ...animation, name: trimmed } : animation,
    )
    set({ bundle: { ...bundle, animations } })
  },

  reorderFrames: (actionId, fromIndex, toIndex) => {
    const { bundle } = get()
    if (!bundle) {
      return
    }
    const animations = bundle.animations.map((animation) => {
      if (animation.id !== actionId) {
        return animation
      }
      const frameIds = [...animation.frameIds]
      if (
        fromIndex < 0 ||
        fromIndex >= frameIds.length ||
        toIndex < 0 ||
        toIndex >= frameIds.length ||
        fromIndex === toIndex
      ) {
        return animation
      }
      const [moved] = frameIds.splice(fromIndex, 1)
      frameIds.splice(toIndex, 0, moved)
      return { ...animation, frameIds }
    })
    const action = animations.find((animation) => animation.id === actionId)
    const currentFrameId = selectedActionFor(bundle, actionId)?.frameIds[get().currentFrameIndex]
    const nextIndex = currentFrameId ? action?.frameIds.indexOf(currentFrameId) ?? 0 : 0
    set({ bundle: { ...bundle, animations }, currentFrameIndex: Math.max(0, nextIndex) })
  },

  setAnchorCalibrationEnabled: (enabled) => {
    const state = get()
    const bundle = state.bundle
    if (enabled && bundle) {
      const nextBundle = ensureActionAlignment(bundle, state.selectedActionId)
      set({ bundle: nextBundle, anchorCalibrationEnabled: true, isPlaying: false })
      return
    }
    set({ anchorCalibrationEnabled: enabled, isPlaying: false })
  },

  setAnchorCalibrationZoom: (zoom) => {
    const safeZoom = Math.max(1, Math.min(24, Math.round(zoom)))
    set({ anchorCalibrationZoom: safeZoom })
  },

  setAnchorGridVisible: (anchorGridVisible) => set({ anchorGridVisible }),
  setAnchorOnionSkin: (anchorOnionSkin) => set({ anchorOnionSkin }),
  setAnchorSnapMode: (anchorSnapMode) => set({ anchorSnapMode }),

  updateFrameAlignment: (frameId, patch) => {
    const state = get()
    if (!state.bundle) return
    const frames = state.bundle.frames.map((frame) => {
      if (frame.id !== frameId) return frame
      const dimensions = frameDimensions(state.bundle!, frame.id)
      return {
        ...frame,
        alignment: {
          ...(frame.alignment ?? resolveFrameAlignment(dimensions.width, dimensions.height, 'bottom-center')),
          ...patch,
        },
      }
    })
    const nextBundle = recalculateActionAlignment({ ...state.bundle, frames }, state.selectedActionId)
    set({ bundle: nextBundle })
  },

  updateActionAlignment: (patch) => {
    const state = get()
    const initialAction = state.bundle ? selectedActionFor(state.bundle, state.selectedActionId) : undefined
    if (!state.bundle || !initialAction) return
    const preparedBundle = initialAction.alignment
      ? state.bundle
      : ensureActionAlignment(state.bundle, initialAction.id)
    const action = selectedActionFor(preparedBundle, initialAction.id)
    if (!action?.alignment) return
    const nextBundle = {
      ...preparedBundle,
      animations: preparedBundle.animations.map((animation) =>
        animation.id === action.id ? { ...animation, alignment: { ...action.alignment!, ...patch } } : animation,
      ),
    }
    set({ bundle: nextBundle })
  },

  applyAnchorPresetToAll: (preset) => {
    const state = get()
    const action = state.bundle ? selectedActionFor(state.bundle, state.selectedActionId) : undefined
    if (!state.bundle || !action) return
    const actionFrameIds = new Set(action.frameIds)
    const frames = state.bundle.frames.map((frame) => {
      if (!actionFrameIds.has(frame.id)) return frame
      const dimensions = frameDimensions(state.bundle!, frame.id)
      const presetAlignment = resolveFrameAlignment(dimensions.width, dimensions.height, preset)
      return {
        ...frame,
        alignment: {
          ...presetAlignment,
          offsetX: frame.alignment?.offsetX ?? 0,
          offsetY: frame.alignment?.offsetY ?? 0,
        },
      }
    })
    const nextBundle = recalculateActionAlignment({ ...state.bundle, frames }, action.id)
    set({ bundle: nextBundle })
  },

  importRegionFiles: async (colorFile, normalFile, config) => {
    set({ isImporting: true, notice: { tone: 'info', message: '正在检测不规则区域…' } })
    try {
      const bundle = await importRegionAssetFiles(colorFile, normalFile, config)
      const warnings = collectCurrentWarnings(bundle)
      const projectId = createProjectId()
      const projectCreatedAt = new Date().toISOString()
      useRefinementStore.getState().initialize(projectId, [], [])
      useProjectStore.getState().initializeFromBundle(bundle)
      set({
        bundle,
        projectId,
        projectCreatedAt,
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: false,
        isImporting: false,
        anchorCalibrationEnabled: false,
        notice: {
          tone: warnings.some((warning) => warning.severity === 'error') ? 'warning' : 'success',
          message: `区域导入完成：${bundle.frames.length} 帧、${bundle.animations.length} 个动作。`,
        },
      })
      return true
    } catch (error) {
      set({
        isImporting: false,
        notice: {
          tone: 'error',
          message: error instanceof Error ? error.message : '区域导入失败。',
        },
      })
      return false
    }
  },

  pairNormal: (frameId, candidate) => {
    const { bundle } = get()
    if (!bundle) {
      return
    }
    const nextBundle = updateFrameNormal(bundle, frameId, candidate)
    const nextFrame = nextBundle.frames.find((frame) => frame.id === frameId)
    const sizeMismatch = candidate && nextFrame?.pairingStatus === 'mismatch'
    set({
      bundle: nextBundle,
      warnings: collectCurrentWarnings(nextBundle),
      notice: {
        tone: sizeMismatch ? 'error' : candidate ? 'success' : 'warning',
        message: sizeMismatch
          ? '法线图尺寸与精灵图不一致，已阻止配对。'
          : candidate
            ? '已手工更新法线图配对。'
            : '已清除法线图配对。',
      },
    })
  },
  setBackend: (backend) => {
    set((state) => ({ settings: { ...state.settings, backend } }))
  },

  setTextureMode: (textureMode) => {
    set((state) => ({ settings: { ...state.settings, textureMode } }))
  },

  setBackground: (background) => {
    set((state) => ({ settings: { ...state.settings, background } }))
  },

  setShowRefinement: (showRefinement) => {
    set((state) => ({ settings: { ...state.settings, showRefinement } }))
  },

  setZoom: (zoom) => {
    const safeZoom = Math.max(0.25, Math.min(4, zoom))
    set((state) => ({ settings: { ...state.settings, zoom: safeZoom } }))
  },

  setPan: (x, y) => {
    set((state) => ({
      settings: {
        ...state.settings,
        panX: Math.max(-2, Math.min(2, x)),
        panY: Math.max(-2, Math.min(2, y)),
      },
    }))
  },

  resetView: () => {
    set((state) => ({ settings: { ...state.settings, zoom: 1, panX: 0, panY: 0 } }))
  },

  setNotice: (notice) => set({ notice }),

  dismissNotice: () => set({ notice: undefined }),
}))

export function getSelectedAction(state: Pick<EditorState, 'bundle' | 'selectedActionId'>): AnimationClip | undefined {
  return state.bundle ? selectedActionFor(state.bundle, state.selectedActionId) : undefined
}

export function getCurrentFrame(state: Pick<EditorState, 'bundle' | 'selectedActionId' | 'currentFrameIndex'>) {
  const action = getSelectedAction(state)
  const frameId = action?.frameIds[state.currentFrameIndex]
  return state.bundle?.frames.find((frame) => frame.id === frameId)
}
