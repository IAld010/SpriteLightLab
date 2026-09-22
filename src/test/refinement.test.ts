import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFrameRefinement,
  findRefinementCel,
  normalizeFrameRefinement,
  reorderRefinementLayer,
} from '../domain/refinement'
import { useRefinementStore } from '../store/refinementStore'

describe('refinement domain', () => {
  it('normalizes legacy refinement layers without changing source data', () => {
    const refinement = createFrameRefinement('frame:1', 32, 24, 'hash')
    refinement.layers[0].opacity = 3
    refinement.layers[0].paletteSwap = true as false
    const normalized = normalizeFrameRefinement(refinement, 32, 24)

    expect(normalized.sourceFrameId).toBe('frame:1')
    expect(normalized.sourceHash).toBe('hash')
    expect(normalized.layers[0].opacity).toBe(1)
    expect(normalized.layers[0].paletteSwap).toBe(false)
    expect(normalized.cels[0]).toMatchObject({ width: 32, height: 24 })
  })

  it('reorders refinement layers from bottom to top', () => {
    const refinement = createFrameRefinement('frame:1', 8, 8)
    const second = { ...refinement.layers[0], id: 'layer:2', name: '第二层' }
    refinement.layers.push(second)

    const reordered = reorderRefinementLayer(refinement, 'layer:2', 'down')
    expect(reordered.layers.map((layer) => layer.id)).toEqual(['layer:2', refinement.layers[0].id])
    expect(reordered.revision).toBe(refinement.revision + 1)
  })
})

describe('refinement store', () => {
  beforeEach(() => {
    useRefinementStore.getState().reset()
  })

  it('creates a copy-on-write cel and supports stroke undo/redo', () => {
    const store = useRefinementStore.getState()
    const refinement = store.ensureFrame('frame:1', 8, 8)
    const layerId = refinement.layers[0].id
    useRefinementStore.getState().saveCelBlob('frame:1', layerId, new Blob(['pixel']), 8, 8)

    let cel = findRefinementCel(useRefinementStore.getState().refinements['frame:1'], layerId)
    expect(cel?.bitmapAssetId).toBeTruthy()
    expect(Object.keys(useRefinementStore.getState().assets)).toHaveLength(1)
    expect(useRefinementStore.getState().dirty).toBe(true)

    useRefinementStore.getState().undo()
    cel = findRefinementCel(useRefinementStore.getState().refinements['frame:1'], layerId)
    expect(cel?.bitmapAssetId).toBeUndefined()

    useRefinementStore.getState().redo()
    cel = findRefinementCel(useRefinementStore.getState().refinements['frame:1'], layerId)
    expect(cel?.bitmapAssetId).toBeTruthy()
  })

  it('copies the read-only source into an editable layer and can hide the source', () => {
    useRefinementStore.getState().ensureFrame('frame:2', 16, 12)
    const copiedLayerId = useRefinementStore.getState().copySourceLayer(
      'frame:2',
      new Blob(['source-copy'], { type: 'image/png' }),
      16,
      12,
    )
    const refinement = useRefinementStore.getState().refinements['frame:2']
    expect(copiedLayerId).toBeTruthy()
    expect(refinement.layers).toHaveLength(1)
    expect(refinement.layers[0].name).toBe('\u6e90\u56fe\u526f\u672c')
    expect(refinement.cels.find((cel) => cel.layerId === copiedLayerId)?.bitmapAssetId).toBeTruthy()

    useRefinementStore.getState().updateSourceLayer('frame:2', { sourceVisible: false, sourceOpacity: 0.5 })
    expect(useRefinementStore.getState().refinements['frame:2']).toMatchObject({
      sourceVisible: false,
      sourceOpacity: 0.5,
    })
  })

  it('supports layers, cel clearing and frame reset', () => {
    const first = useRefinementStore.getState().ensureFrame('frame:1', 8, 8)
    const firstLayer = first.layers[0].id
    const secondLayer = useRefinementStore.getState().addLayer('frame:1')
    useRefinementStore.getState().saveCelBlob('frame:1', firstLayer, new Blob(['a']), 8, 8)
    useRefinementStore.getState().saveCelBlob('frame:1', secondLayer, new Blob(['b']), 8, 8)
    expect(useRefinementStore.getState().refinements['frame:1'].layers).toHaveLength(2)

    useRefinementStore.getState().clearCel('frame:1', secondLayer)
    expect(findRefinementCel(useRefinementStore.getState().refinements['frame:1'], secondLayer)?.bitmapAssetId).toBeUndefined()

    useRefinementStore.getState().resetFrame('frame:1')
    expect(useRefinementStore.getState().refinements['frame:1']).toBeUndefined()
  })
})
