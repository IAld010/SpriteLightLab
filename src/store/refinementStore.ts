import { create } from 'zustand'
import {
  createFrameRefinement,
  createRefinementAssetId,
  findFrameRefinement,
  findRefinementCel,
  normalizeFrameRefinement,
  refinementHistoryLimit,
  removeRefinementLayer,
  reorderRefinementLayer,
} from '../domain/refinement'
import type {
  FrameRefinement,
  RefinementAssetRecord,
  RefinementBlendMode,
  RefinementCel,
  RefinementLayer,
  RefinementLayerKind,
} from '../domain/types'

export type DrawingTool =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'select'
  | 'move'
  | 'hand'

export interface OnionSkinSettings {
  enabled: boolean
  before: number
  after: number
  opacity: number
  beforeColor: string
  afterColor: string
}

interface RefinementSnapshot {
  refinements: Record<string, FrameRefinement>
  assets: Record<string, RefinementAssetRecord>
  selectedLayerId?: string
}

interface RefinementState {
  projectId?: string
  refinements: Record<string, FrameRefinement>
  assets: Record<string, RefinementAssetRecord>
  selectedLayerId?: string
  tool: DrawingTool
  primaryColor: string
  brushSize: number
  pixelGrid: boolean
  onionSkin: OnionSkinSettings
  dirty: boolean
  revision: number
  past: RefinementSnapshot[]
  future: RefinementSnapshot[]
  initialize: (
    projectId: string | undefined,
    refinements: FrameRefinement[],
    assets: RefinementAssetRecord[],
  ) => void
  reset: () => void
  ensureFrame: (sourceFrameId: string, width: number, height: number) => FrameRefinement
  selectLayer: (layerId?: string) => void
  setTool: (tool: DrawingTool) => void
  setPrimaryColor: (color: string) => void
  setBrushSize: (size: number) => void
  setPixelGrid: (visible: boolean) => void
  updateOnionSkin: (patch: Partial<OnionSkinSettings>) => void
  updateSourceLayer: (
    sourceFrameId: string,
    patch: Partial<Pick<FrameRefinement, 'sourceVisible' | 'sourceOpacity'>>,
    recordHistory?: boolean,
  ) => void
  copySourceLayer: (
    sourceFrameId: string,
    blob: Blob,
    width: number,
    height: number,
  ) => string
  addLayer: (sourceFrameId: string, kind?: RefinementLayerKind) => string
  updateLayer: (
    sourceFrameId: string,
    layerId: string,
    patch: Partial<Pick<RefinementLayer, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>,
    recordHistory?: boolean,
  ) => void
  removeLayer: (sourceFrameId: string, layerId: string) => void
  moveLayer: (sourceFrameId: string, layerId: string, direction: 'up' | 'down') => void
  saveCelBlob: (
    sourceFrameId: string,
    layerId: string,
    blob: Blob,
    width: number,
    height: number,
    offsetX?: number,
    offsetY?: number,
  ) => void
  clearCel: (sourceFrameId: string, layerId: string) => void
  deleteCel: (sourceFrameId: string, layerId: string) => void
  copyCel: (sourceFrameId: string, targetFrameId: string, layerId: string) => void
  toggleFrameVisible: (sourceFrameId: string) => void
  resetFrame: (sourceFrameId: string) => void
  undo: () => void
  redo: () => void
  markClean: () => void
}

const DEFAULT_ONION_SKIN: OnionSkinSettings = {
  enabled: false,
  before: 2,
  after: 1,
  opacity: 0.35,
  beforeColor: '#4f8cff',
  afterColor: '#ff6b4a',
}

function cloneRefinements(
  refinements: Record<string, FrameRefinement>,
): Record<string, FrameRefinement> {
  return JSON.parse(JSON.stringify(refinements)) as Record<string, FrameRefinement>
}

function snapshot(state: RefinementState): RefinementSnapshot {
  return {
    refinements: cloneRefinements(state.refinements),
    assets: { ...state.assets },
    selectedLayerId: state.selectedLayerId,
  }
}

function updateRefinement(
  refinements: Record<string, FrameRefinement>,
  sourceFrameId: string,
  update: (refinement: FrameRefinement) => FrameRefinement,
): Record<string, FrameRefinement> {
  const current = refinements[sourceFrameId]
  if (!current) return refinements
  return { ...refinements, [sourceFrameId]: update(current) }
}

function nextRevision(refinement: FrameRefinement): FrameRefinement {
  return { ...refinement, revision: refinement.revision + 1 }
}

function ensureCel(
  refinement: FrameRefinement,
  layerId: string,
  width: number,
  height: number,
): RefinementCel {
  const existing = findRefinementCel(refinement, layerId)
  if (existing) return existing
  return {
    id: `refinement-cel:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`,
    frameId: refinement.sourceFrameId,
    layerId,
    offsetX: 0,
    offsetY: 0,
    width,
    height,
  }
}

function normalizeStoredRefinement(
  refinement: FrameRefinement,
  width: number,
  height: number,
): FrameRefinement {
  return normalizeFrameRefinement(refinement, width, height)
}

export const useRefinementStore = create<RefinementState>((set, get) => {
  const commit = () => {
    const state = get()
    set({
      past: [...state.past.slice(-(refinementHistoryLimit() - 1)), snapshot(state)],
      future: [],
      dirty: true,
    })
  }

  return {
    refinements: {},
    assets: {},
    tool: 'pencil',
    primaryColor: '#ffffff',
    brushSize: 1,
    pixelGrid: false,
    onionSkin: DEFAULT_ONION_SKIN,
    dirty: false,
    revision: 0,
    past: [],
    future: [],

    initialize: (projectId, refinements, assets) => {
      const nextRefinements: Record<string, FrameRefinement> = {}
      for (const refinement of refinements ?? []) {
        nextRefinements[refinement.sourceFrameId] = normalizeStoredRefinement(
          refinement,
          refinement.cels[0]?.width ?? 1,
          refinement.cels[0]?.height ?? 1,
        )
      }
      const nextAssets: Record<string, RefinementAssetRecord> = {}
      for (const asset of assets ?? []) {
        nextAssets[asset.id] = { ...asset, projectId: projectId ?? asset.projectId }
      }
      set({
        projectId,
        refinements: nextRefinements,
        assets: nextAssets,
        selectedLayerId: Object.values(nextRefinements)[0]?.layers[0]?.id,
        dirty: false,
        revision: 0,
        past: [],
        future: [],
      })
    },

    reset: () => set({
      projectId: undefined,
      refinements: {},
      assets: {},
      selectedLayerId: undefined,
      dirty: false,
      revision: 0,
      past: [],
      future: [],
    }),

    ensureFrame: (sourceFrameId, width, height) => {
      const current = get().refinements[sourceFrameId]
      if (current) {
        return normalizeStoredRefinement(current, width, height)
      }
      const refinement = createFrameRefinement(sourceFrameId, width, height)
      set((state) => ({
        refinements: { ...state.refinements, [sourceFrameId]: refinement },
        selectedLayerId: state.selectedLayerId ?? refinement.layers[0]?.id,
      }))
      return refinement
    },

    selectLayer: (selectedLayerId) => set({ selectedLayerId }),

    setTool: (tool) => set({ tool }),
    setPrimaryColor: (primaryColor) => set({ primaryColor }),
    setBrushSize: (brushSize) => set({ brushSize: Math.max(1, Math.min(64, Math.round(brushSize))) }),
    setPixelGrid: (pixelGrid) => set({ pixelGrid }),
    updateOnionSkin: (patch) => set((state) => ({ onionSkin: { ...state.onionSkin, ...patch } })),

    updateSourceLayer: (sourceFrameId, patch, recordHistory = true) => {
      if (!get().refinements[sourceFrameId]) return
      if (recordHistory) commit()
      set((state) => ({
        refinements: updateRefinement(state.refinements, sourceFrameId, (refinement) => nextRevision({
          ...refinement,
          ...patch,
          sourceVisible: patch.sourceVisible ?? refinement.sourceVisible,
          sourceOpacity: patch.sourceOpacity === undefined
            ? refinement.sourceOpacity
            : Math.min(1, Math.max(0, patch.sourceOpacity)),
        })),
        dirty: true,
      }))
    },

    copySourceLayer: (sourceFrameId, blob, width, height) => {
      commit()
      const state = get()
      const refinement = state.refinements[sourceFrameId]
      if (!refinement) return ''
      const emptyInitialLayer = refinement.layers.length === 1 &&
        !refinement.cels.some((cel) => Boolean(cel.bitmapAssetId))
      const layer: RefinementLayer = emptyInitialLayer
        ? {
            ...refinement.layers[0],
            name: '\u6e90\u56fe\u526f\u672c',
            kind: 'raster',
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            paletteSwap: false,
          }
        : {
            id: `refinement-layer:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`,
            name: '\u6e90\u56fe\u526f\u672c',
            kind: 'raster',
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            paletteSwap: false,
          }
      const assetId = createRefinementAssetId()
      const asset: RefinementAssetRecord = {
        id: assetId,
        projectId: state.projectId ?? '',
        frameId: sourceFrameId,
        layerId: layer.id,
        blob,
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        updatedAt: new Date().toISOString(),
      }
      const cel = {
        ...ensureCel(refinement, layer.id, asset.width, asset.height),
        bitmapAssetId: assetId,
      }
      set({
        assets: { ...state.assets, [assetId]: asset },
        refinements: updateRefinement(state.refinements, sourceFrameId, (item) => ({
          ...item,
          layers: emptyInitialLayer
            ? [layer]
            : [...item.layers, layer],
          cels: [
            ...item.cels.filter((candidate) => candidate.layerId !== layer.id),
            cel,
          ],
          revision: item.revision + 1,
        })),
        selectedLayerId: layer.id,
      })
      return layer.id
    },

    addLayer: (sourceFrameId, kind = 'raster') => {
      commit()
      const state = get()
      const refinement = state.refinements[sourceFrameId]
      const currentWidth = refinement?.cels[0]?.width ?? 1
      const currentHeight = refinement?.cels[0]?.height ?? 1
      const layer = {
        id: `refinement-layer:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`,
        name: `\u7ec6\u5316\u5c42 ${(refinement?.layers.length ?? 0) + 1}`,
        kind,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        paletteSwap: false as const,
      }
      if (!refinement) {
        const created = createFrameRefinement(sourceFrameId, currentWidth, currentHeight)
        created.layers = [layer]
        created.cels = [ensureCel(created, layer.id, currentWidth, currentHeight)]
        set({ refinements: { ...state.refinements, [sourceFrameId]: created }, selectedLayerId: layer.id })
        return layer.id
      }
      const cel = ensureCel(refinement, layer.id, currentWidth, currentHeight)
      set({
        refinements: updateRefinement(state.refinements, sourceFrameId, (item) => ({
          ...item,
          layers: [...item.layers, layer],
          cels: [...item.cels, cel],
          revision: item.revision + 1,
        })),
        selectedLayerId: layer.id,
      })
      return layer.id
    },

    updateLayer: (sourceFrameId, layerId, patch, recordHistory = true) => {
      if (recordHistory) commit()
      set((state) => ({
        refinements: updateRefinement(state.refinements, sourceFrameId, (refinement) => ({
          ...refinement,
          layers: refinement.layers.map((layer) =>
            layer.id === layerId
              ? {
                  ...layer,
                  ...patch,
                  opacity: patch.opacity === undefined
                    ? layer.opacity
                    : Math.min(1, Math.max(0, patch.opacity)),
                  blendMode: patch.blendMode ?? layer.blendMode,
                  paletteSwap: false,
                }
              : layer,
          ),
          revision: refinement.revision + 1,
        })),
        dirty: true,
      }))
    },

    removeLayer: (sourceFrameId, layerId) => {
      const refinement = get().refinements[sourceFrameId]
      if (!refinement || refinement.layers.length <= 1) return
      commit()
      set((state) => {
        const removed = removeRefinementLayer(refinement, layerId)
        const remainingAssetIds = new Set(
          removed.cels.flatMap((cel) => cel.bitmapAssetId ? [cel.bitmapAssetId] : []),
        )
        const assets = Object.fromEntries(
          Object.entries(state.assets).filter(([id, asset]) =>
            asset.frameId !== sourceFrameId || remainingAssetIds.has(id),
          ),
        )
        return {
          refinements: { ...state.refinements, [sourceFrameId]: removed },
          assets,
          selectedLayerId: removed.layers[0]?.id,
        }
      })
    },

    moveLayer: (sourceFrameId, layerId, direction) => {
      commit()
      set((state) => ({
        refinements: updateRefinement(state.refinements, sourceFrameId, (refinement) =>
          reorderRefinementLayer(refinement, layerId, direction),
        ),
      }))
    },

    saveCelBlob: (sourceFrameId, layerId, blob, width, height, offsetX = 0, offsetY = 0) => {
      const state = get()
      const refinement = state.refinements[sourceFrameId]
      if (!refinement) return
      commit()
      const assetId = createRefinementAssetId()
      const now = new Date().toISOString()
      const asset: RefinementAssetRecord = {
        id: assetId,
        projectId: state.projectId ?? '',
        frameId: sourceFrameId,
        layerId,
        blob,
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        updatedAt: now,
      }
      const replacement = updateRefinement(state.refinements, sourceFrameId, (item) => {
        const currentCel = ensureCel(item, layerId, width, height)
        return nextRevision({
          ...item,
          cels: [
            ...item.cels.filter((cel) => cel.layerId !== layerId),
            {
              ...currentCel,
              bitmapAssetId: assetId,
              offsetX,
              offsetY,
              width: asset.width,
              height: asset.height,
            },
          ],
        })
      })
      const usedAssetIds = new Set(
        replacement[sourceFrameId]?.cels.flatMap((cel) => cel.bitmapAssetId ? [cel.bitmapAssetId] : []) ?? [],
      )
      const assets = { ...state.assets }
      const oldCel = findRefinementCel(refinement, layerId)
      if (oldCel?.bitmapAssetId && !usedAssetIds.has(oldCel.bitmapAssetId)) {
        delete assets[oldCel.bitmapAssetId]
      }
      assets[assetId] = asset
      set({ refinements: replacement, assets })
    },

    clearCel: (sourceFrameId, layerId) => {
      const state = get()
      const refinement = state.refinements[sourceFrameId]
      if (!refinement) return
      commit()
      set({
        refinements: updateRefinement(state.refinements, sourceFrameId, (item) => {
          const cel = ensureCel(item, layerId, item.cels[0]?.width ?? 1, item.cels[0]?.height ?? 1)
          return nextRevision({
            ...item,
            cels: [
              ...item.cels.filter((candidate) => candidate.layerId !== layerId),
              { ...cel, bitmapAssetId: undefined },
            ],
          })
        }),
      })
    },

    deleteCel: (sourceFrameId, layerId) => {
      const state = get()
      const refinement = state.refinements[sourceFrameId]
      if (!refinement) return
      commit()
      set({
        refinements: updateRefinement(state.refinements, sourceFrameId, (item) => ({
          ...item,
          cels: item.cels.filter((cel) => cel.layerId !== layerId),
          revision: item.revision + 1,
        })),
      })
    },

    copyCel: (sourceFrameId, targetFrameId, layerId) => {
      const state = get()
      const sourceRefinement = state.refinements[sourceFrameId]
      const target = state.refinements[targetFrameId]
      if (!sourceRefinement || !target) return
      const targetLayerIndex = target.layers.findIndex((layer) => layer.id === layerId)
      const sourceLayer = sourceRefinement.layers[targetLayerIndex] ??
        sourceRefinement.layers.find((layer) => layer.name === target.layers[targetLayerIndex]?.name)
      const sourceCel = findRefinementCel(sourceRefinement, sourceLayer?.id ?? layerId)
      const sourceAsset = sourceCel?.bitmapAssetId ? state.assets[sourceCel.bitmapAssetId] : undefined
      if (!sourceCel || !sourceAsset) return
      commit()
      const assetId = createRefinementAssetId()
      const asset: RefinementAssetRecord = {
        ...sourceAsset,
        id: assetId,
        frameId: targetFrameId,
        updatedAt: new Date().toISOString(),
      }
      set({
        assets: { ...state.assets, [assetId]: asset },
        refinements: updateRefinement(state.refinements, targetFrameId, (refinement) => {
          const currentCel = ensureCel(refinement, layerId, sourceCel.width, sourceCel.height)
          return nextRevision({
            ...refinement,
            cels: [
              ...refinement.cels.filter((cel) => cel.layerId !== layerId),
              {
                ...currentCel,
                bitmapAssetId: assetId,
                offsetX: sourceCel.offsetX,
                offsetY: sourceCel.offsetY,
                width: sourceCel.width,
                height: sourceCel.height,
              },
            ],
          })
        }),
      })
    },

    toggleFrameVisible: (sourceFrameId) => {
      if (!get().refinements[sourceFrameId]) return
      commit()
      set((state) => ({
        refinements: updateRefinement(state.refinements, sourceFrameId, (refinement) =>
          nextRevision({ ...refinement, visible: !refinement.visible }),
        ),
      }))
    },

    resetFrame: (sourceFrameId) => {
      if (!get().refinements[sourceFrameId]) return
      commit()
      set((state) => {
        const assets = Object.fromEntries(
          Object.entries(state.assets).filter(([, asset]) => asset.frameId !== sourceFrameId),
        )
        const refinements = { ...state.refinements }
        delete refinements[sourceFrameId]
        return { assets, refinements, selectedLayerId: undefined }
      })
    },

    undo: () => {
      const state = get()
      const previous = state.past.at(-1)
      if (!previous) return
      set({
        refinements: previous.refinements,
        assets: previous.assets,
        selectedLayerId: previous.selectedLayerId,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, refinementHistoryLimit()),
        dirty: true,
        revision: state.revision + 1,
      })
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) return
      set({
        refinements: next.refinements,
        assets: next.assets,
        selectedLayerId: next.selectedLayerId,
        past: [...state.past, snapshot(state)].slice(-refinementHistoryLimit()),
        future: state.future.slice(1),
        dirty: true,
        revision: state.revision + 1,
      })
    },

    markClean: () => set({ dirty: false }),
  }
})

export function getRefinementProjectState(): {
  refinements: FrameRefinement[]
  assets: RefinementAssetRecord[]
} {
  const state = useRefinementStore.getState()
  return {
    refinements: Object.values(state.refinements),
    assets: Object.values(state.assets),
  }
}

export function getFrameRefinementForStore(sourceFrameId: string): FrameRefinement | undefined {
  return findFrameRefinement(Object.values(useRefinementStore.getState().refinements), sourceFrameId)
}

export function getLayerById(
  refinement: FrameRefinement,
  layerId?: string,
): RefinementLayer | undefined {
  return refinement.layers.find((layer) => layer.id === layerId)
}

export function getCelForLayer(
  refinement: FrameRefinement,
  layerId?: string,
): RefinementCel | undefined {
  return layerId ? findRefinementCel(refinement, layerId) : undefined
}

export function blendModeLabel(mode: RefinementBlendMode): string {
  if (mode === 'add') return '\u52a0\u6cd5'
  if (mode === 'multiply') return '\u6b63\u7247\u53e0\u5e95'
  if (mode === 'screen') return '\u6ee4\u8272'
  return '\u666e\u901a'
}
