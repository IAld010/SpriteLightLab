import { create } from 'zustand'
import { createDefaultLighting, createDefaultPreferences } from '../domain/defaults'
import {
  createColorAdjustments,
  createColorRule,
  createPalettePreset,
  normalizeHex,
} from '../domain/palette'
import type { ProjectStateSnapshot } from '../domain/projectDocument'
import type {
  AssetBundle,
  ColorAdjustments,
  ColorRule,
  LightSource,
  LightType,
  LightingState,
  PalettePreset,
  RenderPreferences,
  UndoSnapshot,
} from '../domain/types'

const HISTORY_LIMIT = 50

function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `${prefix}:${random}`
}

function cloneSnapshot(snapshot: UndoSnapshot): UndoSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as UndoSnapshot
}

function createInitialProjectState() {
  return {
    projectName: '未命名精灵项目',
    palettePresets: [createPalettePreset('palette:default', '默认', [])],
    activePaletteId: 'palette:default',
    lighting: createDefaultLighting(),
    renderPreferences: createDefaultPreferences(),
    past: [] as UndoSnapshot[],
    future: [] as UndoSnapshot[],
  }
}

interface ProjectState {
  projectName: string
  palettePresets: PalettePreset[]
  activePaletteId: string
  lighting: LightingState
  renderPreferences: RenderPreferences
  past: UndoSnapshot[]
  future: UndoSnapshot[]
  initializeFromBundle: (bundle: AssetBundle) => void
  applyProjectState: (state: ProjectStateSnapshot) => void
  setProjectName: (name: string) => void
  setActivePalette: (paletteId: string) => void
  addPalette: (name?: string) => void
  duplicatePalette: (paletteId: string) => void
  deletePalette: (paletteId: string) => void
  renamePalette: (paletteId: string, name: string) => void
  updatePaletteEntry: (source: string, target: string) => void
  resetPaletteEntries: () => void
  importPaletteColors: (colors: string[], name?: string) => void
  addColorRule: () => void
  updateColorRule: (ruleId: string, patch: Partial<ColorRule>) => void
  removeColorRule: (ruleId: string) => void
  updateAdjustments: (patch: Partial<ColorAdjustments>) => void
  updateAmbient: (patch: Partial<Pick<LightingState, 'ambientColor' | 'ambientIntensity'>>) => void
  addLight: (type: LightType) => void
  updateLight: (lightId: string, patch: Partial<LightSource>, recordHistory?: boolean) => void
  removeLight: (lightId: string) => void
  selectLight: (lightId?: string) => void
  updateRenderPreferences: (patch: Partial<RenderPreferences>) => void
  resetProjectState: () => void
  undo: () => void
  redo: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const snapshot = (): UndoSnapshot => {
    const state = get()
    return cloneSnapshot({
      palettePresets: state.palettePresets,
      activePaletteId: state.activePaletteId,
      lighting: state.lighting,
      renderPreferences: state.renderPreferences,
    })
  }

  const commit = (): void => {
    set((state) => ({
      past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot()],
      future: [],
    }))
  }

  const updateActivePalette = (
    update: (palette: PalettePreset) => PalettePreset,
    history = true,
  ) => {
    if (history) {
      commit()
    }
    set((state) => ({
      palettePresets: state.palettePresets.map((palette) =>
        palette.id === state.activePaletteId ? update(palette) : palette,
      ),
    }))
  }

  return {
    ...createInitialProjectState(),

    initializeFromBundle: (bundle) => {
      const defaultPalette = createPalettePreset(
        makeId('palette'),
        '默认',
        bundle.paletteSources,
      )
      set({
        projectName: bundle.sourceName.replace(/\.[^.]+$/, '') || '精灵项目',
        palettePresets: [defaultPalette],
        activePaletteId: defaultPalette.id,
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
        past: [],
        future: [],
      })
    },

    applyProjectState: (snapshotValue) => {
      set({
        projectName: snapshotValue.projectName,
        palettePresets: snapshotValue.palettePresets,
        activePaletteId: snapshotValue.activePaletteId,
        lighting: snapshotValue.lighting,
        renderPreferences: snapshotValue.renderPreferences,
        past: [],
        future: [],
      })
    },

    setProjectName: (projectName) => {
      set({ projectName: projectName.trim() || '未命名精灵项目' })
    },

    setActivePalette: (activePaletteId) => set({ activePaletteId }),

    addPalette: (name) => {
      commit()
      const current = get().palettePresets.find((palette) => palette.id === get().activePaletteId)
      const palette = createPalettePreset(
        makeId('palette'),
        name?.trim() || `配色 ${get().palettePresets.length + 1}`,
        current?.entries.map((entry) => entry.source) ?? [],
      )
      set((state) => ({
        palettePresets: [...state.palettePresets, palette],
        activePaletteId: palette.id,
      }))
    },

    duplicatePalette: (paletteId) => {
      commit()
      const source = get().palettePresets.find((palette) => palette.id === paletteId)
      if (!source) {
        return
      }
      const palette = cloneSnapshot({
        palettePresets: [{ ...source, id: makeId('palette'), name: `${source.name} 副本` }],
        activePaletteId: '',
        lighting: get().lighting,
        renderPreferences: get().renderPreferences,
      }).palettePresets[0]
      set((state) => ({
        palettePresets: [...state.palettePresets, palette],
        activePaletteId: palette.id,
      }))
    },

    deletePalette: (paletteId) => {
      const state = get()
      if (state.palettePresets.length <= 1) {
        return
      }
      commit()
      const palettePresets = state.palettePresets.filter((palette) => palette.id !== paletteId)
      set({
        palettePresets,
        activePaletteId:
          state.activePaletteId === paletteId ? palettePresets[0].id : state.activePaletteId,
      })
    },

    renamePalette: (paletteId, name) => {
      commit()
      set((state) => ({
        palettePresets: state.palettePresets.map((palette) =>
          palette.id === paletteId ? { ...palette, name: name.trim() || palette.name } : palette,
        ),
      }))
    },

    updatePaletteEntry: (source, target) => {
      updateActivePalette((palette) => ({
        ...palette,
        entries: palette.entries.map((entry) =>
          normalizeHex(entry.source) === normalizeHex(source)
            ? { ...entry, target: normalizeHex(target) }
            : entry,
        ),
      }))
    },

    resetPaletteEntries: () => {
      updateActivePalette((palette) => ({
        ...palette,
        entries: palette.entries.map((entry) => ({ ...entry, target: entry.source })),
        adjustments: createColorAdjustments(),
      }))
    },

    importPaletteColors: (colors, name) => {
      const state = get()
      const current = state.palettePresets.find((palette) => palette.id === state.activePaletteId)
      const sources = current?.entries.map((entry) => entry.source) ?? []
      const palette = createPalettePreset(makeId('palette'), name?.trim() || '导入色板', sources)
      palette.entries = palette.entries.map((entry, index) => ({
        source: entry.source,
        target: normalizeHex(colors[index] ?? entry.source),
      }))
      commit()
      set((stateValue) => ({
        palettePresets: [...stateValue.palettePresets, palette],
        activePaletteId: palette.id,
      }))
    },

    addColorRule: () => {
      updateActivePalette((palette) => ({
        ...palette,
        rules: [...palette.rules, createColorRule()],
      }))
    },

    updateColorRule: (ruleId, patch) => {
      updateActivePalette((palette) => ({
        ...palette,
        rules: palette.rules.map((rule) =>
          rule.id === ruleId
            ? {
                ...rule,
                ...patch,
                source: patch.source ? normalizeHex(patch.source) : rule.source,
                target: patch.target ? normalizeHex(patch.target) : rule.target,
              }
            : rule,
        ),
      }))
    },

    removeColorRule: (ruleId) => {
      updateActivePalette((palette) => ({
        ...palette,
        rules: palette.rules.filter((rule) => rule.id !== ruleId),
      }))
    },

    updateAdjustments: (patch) => {
      updateActivePalette((palette) => ({
        ...palette,
        adjustments: { ...palette.adjustments, ...patch },
      }))
    },

    updateAmbient: (patch) => {
      commit()
      set((state) => ({ lighting: { ...state.lighting, ...patch } }))
    },

    addLight: (type) => {
      commit()
      const count = get().lighting.lights.length + 1
      const light: LightSource = {
        id: makeId('light'),
        name:
          type === 'directional'
            ? `方向光 ${count}`
            : type === 'point'
              ? `点光 ${count}`
              : `聚光 ${count}`,
        type,
        enabled: true,
        color: type === 'point' ? '#ffb46b' : '#ffffff',
        intensity: 1,
        x: type === 'directional' ? 0.5 : 0.62,
        y: type === 'directional' ? 0.5 : 0.62,
        direction: 225,
        radius: type === 'point' ? 0.68 : 0.55,
        innerAngle: 28,
        outerAngle: 52,
        falloff: 2,
      }
      set((state) => ({
        lighting: {
          ...state.lighting,
          lights: [...state.lighting.lights, light],
          selectedLightId: light.id,
        },
      }))
    },

    updateLight: (lightId, patch, recordHistory = true) => {
      if (recordHistory) {
        commit()
      }
      set((state) => ({
        lighting: {
          ...state.lighting,
          lights: state.lighting.lights.map((light) =>
            light.id === lightId ? { ...light, ...patch } : light,
          ),
        },
      }))
    },

    removeLight: (lightId) => {
      commit()
      set((state) => {
        const lights = state.lighting.lights.filter((light) => light.id !== lightId)
        return {
          lighting: {
            ...state.lighting,
            lights,
            selectedLightId:
              state.lighting.selectedLightId === lightId
                ? lights[0]?.id
                : state.lighting.selectedLightId,
          },
        }
      })
    },

    selectLight: (selectedLightId) => {
      set((state) => ({ lighting: { ...state.lighting, selectedLightId } }))
    },

    updateRenderPreferences: (patch) => {
      commit()
      set((state) => ({ renderPreferences: { ...state.renderPreferences, ...patch } }))
    },

    resetProjectState: () => {
      set(createInitialProjectState())
    },

    undo: () => {
      const state = get()
      const previous = state.past.at(-1)
      if (!previous) {
        return
      }
      const current = snapshot()
      set({
        ...previous,
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, HISTORY_LIMIT),
      })
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) {
        return
      }
      const current = snapshot()
      set({
        ...next,
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      })
    },
  }
})

export function activePaletteFromState(state: ProjectState): PalettePreset | undefined {
  return state.palettePresets.find((palette) => palette.id === state.activePaletteId)
}
