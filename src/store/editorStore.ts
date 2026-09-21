import { create } from 'zustand'
import { createDemoFiles, createFullColorDemoFiles } from '../demo/createDemoFiles'
import { importProjectZip } from '../services/projectIO'
import { useProjectStore } from './projectStore'
import {
  applyProjectDocumentToBundle,
  projectStateFromDocument,
} from '../domain/projectDocument'
import {
  ImportError,
  collectCurrentWarnings,
  importFiles as importAssetFiles,
  updateFrameNormal,
} from '../domain/importAssets'
import type {
  AnimationClip,
  AssetBundle,
  BackendPreference,
  EditorSettings,
  ImportWarning,
  PreviewBackground,
  PreviewTextureMode,
  ProjectDocumentV1,
  TextureRef,
} from '../domain/types'

export interface EditorNotice {
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
}

interface EditorState {
  bundle?: AssetBundle
  warnings: ImportWarning[]
  selectedActionId?: string
  currentFrameIndex: number
  isPlaying: boolean
  isImporting: boolean
  settings: EditorSettings
  notice?: EditorNotice
  importLocalFiles: (files: File[]) => Promise<void>
  importProjectFiles: (files: File[], document: ProjectDocumentV1) => Promise<void>
  applyProjectDocument: (document: ProjectDocumentV1) => void
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
  renameAction: (actionId: string, name: string) => void
  reorderFrames: (actionId: string, fromIndex: number, toIndex: number) => void
  pairNormal: (frameId: string, candidate?: TextureRef) => void
  setBackend: (backend: BackendPreference) => void
  setTextureMode: (mode: PreviewTextureMode) => void
  setBackground: (background: PreviewBackground) => void
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
  }
}

function selectedActionFor(bundle: AssetBundle, actionId?: string): AnimationClip | undefined {
  return bundle.animations.find((animation) => animation.id === actionId) ?? bundle.animations[0]
}

export const useEditorStore = create<EditorState>((set, get) => ({
  warnings: [],
  currentFrameIndex: 0,
  isPlaying: false,
  isImporting: false,
  settings: {
    backend: 'webgl',
    textureMode: 'color',
    background: 'checker',
    zoom: 1,
    panX: 0,
    panY: 0,
  },

  importLocalFiles: async (files) => {
    if (files.length === 0) {
      return
    }
    set({ isImporting: true, notice: { tone: 'info', message: '正在解析素材…' } })
    try {
      const bundle = await importAssetFiles(files)
      const warnings = collectCurrentWarnings(bundle)
      useProjectStore.getState().initializeFromBundle(bundle)
      set({
        bundle,
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: bundle.animations[0]?.frameIds.length ? false : false,
        isImporting: false,
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

  importProjectFiles: async (files, document) => {
    if (files.length === 0) {
      return
    }
    set({ isImporting: true, notice: { tone: 'info', message: '\u6b63\u5728\u6062\u590d\u9879\u76ee\u4e0e\u7d20\u6750\u2026' } })
    try {
      const imported = await importAssetFiles(files)
      const bundle = applyProjectDocumentToBundle(imported, document)
      useProjectStore.getState().applyProjectState(projectStateFromDocument(document))
      const warnings = collectCurrentWarnings(bundle)
      set({
        bundle,
        warnings,
        selectedActionId: bundle.animations[0]?.id,
        currentFrameIndex: 0,
        isPlaying: false,
        isImporting: false,
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
    set({
      bundle: nextBundle,
      warnings: collectCurrentWarnings(nextBundle),
      selectedActionId: nextBundle.animations[0]?.id,
      currentFrameIndex: 0,
      isPlaying: false,
      settings: mergeSettings(get().settings, document.settings),
      notice: { tone: 'success', message: '\u9879\u76ee\u914d\u7f6e\u5df2\u5e94\u7528\u5230\u5f53\u524d\u7d20\u6750\u3002' },
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
      await get().importProjectFiles(portable.files, portable.document)
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
    const { bundle } = get()
    const action = bundle ? selectedActionFor(bundle, actionId) : undefined
    set({
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

  pairNormal: (frameId, candidate) => {
    const { bundle } = get()
    if (!bundle) {
      return
    }
    const nextBundle = updateFrameNormal(bundle, frameId, candidate)
    set({
      bundle: nextBundle,
      warnings: collectCurrentWarnings(nextBundle),
      notice: {
        tone: candidate ? 'success' : 'warning',
        message: candidate ? '已手工更新法线图配对。' : '已清除法线图配对。',
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