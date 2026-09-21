import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../store/projectStore'

describe('project store', () => {
  beforeEach(() => {
    useProjectStore.getState().initializeFromBundle({
      id: 'bundle:test',
      mode: 'frames',
      sourceName: 'test',
      importedAt: new Date(0).toISOString(),
      images: [],
      frames: [],
      animations: [],
      normalCandidates: [],
      paletteMode: 'indexed',
      paletteSources: ['#ff0000', '#00ff00'],
      warnings: [],
    })
  })

  it('edits palettes and supports undo/redo', () => {
    const palette = useProjectStore.getState().palettePresets[0]
    useProjectStore.getState().updatePaletteEntry('#ff0000', '#0000ff')
    expect(useProjectStore.getState().palettePresets[0].entries[0].target).toBe('#0000ff')

    useProjectStore.getState().undo()
    expect(useProjectStore.getState().palettePresets[0].entries[0].target).toBe('#ff0000')

    useProjectStore.getState().redo()
    expect(useProjectStore.getState().palettePresets[0].entries[0].target).toBe('#0000ff')
    expect(palette.id).toBeTruthy()
  })

  it('adds, edits and removes lights', () => {
    useProjectStore.getState().addLight('spot')
    const light = useProjectStore.getState().lighting.lights.at(-1)!
    useProjectStore.getState().updateLight(light.id, { intensity: 2.5, direction: 45 })
    expect(useProjectStore.getState().lighting.lights.at(-1)?.intensity).toBe(2.5)

    useProjectStore.getState().removeLight(light.id)
    expect(useProjectStore.getState().lighting.lights.some((item) => item.id === light.id)).toBe(false)
  })

  it('resets all project-level state', () => {
    useProjectStore.getState().setProjectName('待移除项目')
    useProjectStore.getState().addLight('point')
    useProjectStore.getState().resetProjectState()

    expect(useProjectStore.getState().projectName).toBe('未命名精灵项目')
    expect(useProjectStore.getState().lighting.lights).toHaveLength(2)
    expect(useProjectStore.getState().palettePresets).toHaveLength(1)
    expect(useProjectStore.getState().past).toHaveLength(0)
  })
})
