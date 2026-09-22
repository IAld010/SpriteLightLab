import type {
  FrameRefinement,
  RefinementBlendMode,
  RefinementCel,
  RefinementLayer,
  RefinementLayerKind,
} from './types'

const HISTORY_LIMIT = 32

function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `${prefix}:${random}`
}

export function createRefinementLayer(
  name = '\u7ec6\u5316\u5c42 1',
  kind: RefinementLayerKind = 'raster',
): RefinementLayer {
  return {
    id: makeId('refinement-layer'),
    name,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    paletteSwap: false,
  }
}

export function createRefinementCel(
  sourceFrameId: string,
  layerId: string,
  width: number,
  height: number,
): RefinementCel {
  return {
    id: makeId('refinement-cel'),
    frameId: sourceFrameId,
    layerId,
    offsetX: 0,
    offsetY: 0,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

export function createFrameRefinement(
  sourceFrameId: string,
  width: number,
  height: number,
  sourceHash = '',
): FrameRefinement {
  const layer = createRefinementLayer()
  return {
    id: makeId('refinement'),
    sourceFrameId,
    visible: true,
    sourceVisible: true,
    sourceOpacity: 1,
    layers: [layer],
    cels: [createRefinementCel(sourceFrameId, layer.id, width, height)],
    revision: 1,
    sourceHash,
  }
}

export function normalizeFrameRefinement(
  refinement: FrameRefinement,
  width: number,
  height: number,
): FrameRefinement {
  const layers = Array.isArray(refinement.layers) && refinement.layers.length > 0
    ? refinement.layers.map((layer) => ({
        ...layer,
        visible: layer.visible !== false,
        locked: layer.locked === true,
        opacity: Math.min(1, Math.max(0, Number.isFinite(layer.opacity) ? layer.opacity : 1)),
        blendMode: normalizeBlendMode(layer.blendMode),
        paletteSwap: false as const,
      }))
    : [createRefinementLayer()]

  const layerIds = new Set(layers.map((layer) => layer.id))
  const existingCels = Array.isArray(refinement.cels) ? refinement.cels : []
  const cels = existingCels
    .filter((cel) => layerIds.has(cel.layerId))
    .map((cel) => ({
      ...cel,
      width: Math.max(1, Math.round(cel.width || width)),
      height: Math.max(1, Math.round(cel.height || height)),
      offsetX: Number.isFinite(cel.offsetX) ? cel.offsetX : 0,
      offsetY: Number.isFinite(cel.offsetY) ? cel.offsetY : 0,
    }))

  return {
    ...refinement,
    visible: refinement.visible !== false,
    sourceVisible: refinement.sourceVisible !== false,
    sourceOpacity: Math.min(1, Math.max(0, Number.isFinite(refinement.sourceOpacity) ? refinement.sourceOpacity : 1)),
    revision: Math.max(1, Math.round(refinement.revision || 1)),
    sourceHash: refinement.sourceHash ?? '',
    layers,
    cels,
  }
}

export function normalizeBlendMode(value: unknown): RefinementBlendMode {
  return value === 'add' || value === 'multiply' || value === 'screen'
    ? value
    : 'normal'
}

export function findFrameRefinement(
  refinements: readonly FrameRefinement[],
  sourceFrameId: string,
): FrameRefinement | undefined {
  return refinements.find((refinement) => refinement.sourceFrameId === sourceFrameId)
}

export function findRefinementCel(
  refinement: FrameRefinement | undefined,
  layerId: string,
): RefinementCel | undefined {
  return refinement?.cels.find((cel) => cel.layerId === layerId)
}

export function hasRefinementPixels(refinement: FrameRefinement | undefined): boolean {
  return Boolean(refinement?.cels.some((cel) => Boolean(cel.bitmapAssetId)))
}

export function reorderRefinementLayer(
  refinement: FrameRefinement,
  layerId: string,
  direction: 'up' | 'down',
): FrameRefinement {
  const index = refinement.layers.findIndex((layer) => layer.id === layerId)
  const target = direction === 'up' ? index + 1 : index - 1
  if (index < 0 || target < 0 || target >= refinement.layers.length) {
    return refinement
  }
  const layers = [...refinement.layers]
  const [moved] = layers.splice(index, 1)
  layers.splice(target, 0, moved)
  return { ...refinement, layers, revision: refinement.revision + 1 }
}

export function removeRefinementLayer(
  refinement: FrameRefinement,
  layerId: string,
): FrameRefinement {
  if (refinement.layers.length <= 1) {
    return refinement
  }
  return {
    ...refinement,
    layers: refinement.layers.filter((layer) => layer.id !== layerId),
    cels: refinement.cels.filter((cel) => cel.layerId !== layerId),
    revision: refinement.revision + 1,
  }
}

export function refinementHistoryLimit(): number {
  return HISTORY_LIMIT
}

export function createRefinementAssetId(): string {
  return makeId('refinement-asset')
}
