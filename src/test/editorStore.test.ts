import { beforeEach, describe, expect, it } from 'vitest'
import type { AssetBundle } from '../domain/types'
import { useEditorStore } from '../store/editorStore'

function makeBundle(): AssetBundle {
  const file = new File(['pixel'], 'idle_0001.png', { type: 'image/png' })
  const image = {
    id: 'image:1',
    name: 'idle_0001.png',
    path: 'idle_0001.png',
    file,
    width: 32,
    height: 32,
  }
  return {
    id: 'bundle:test',
    mode: 'frames',
    sourceName: 'test',
    importedAt: new Date(0).toISOString(),
    images: [image],
    frames: [
      {
        id: 'frame:1',
        name: 'idle_0001',
        source: { id: 'source:1', name: 'idle_0001.png', imageId: image.id },
        pairingStatus: 'missing',
      },
      {
        id: 'frame:2',
        name: 'idle_0002',
        source: { id: 'source:2', name: 'idle_0002.png', imageId: image.id },
        pairingStatus: 'missing',
      },
    ],
    animations: [
      {
        id: 'clip:1',
        name: 'idle',
        frameIds: ['frame:1', 'frame:2'],
        fps: 8,
        loop: true,
      },
    ],
    paletteMode: 'indexed',
    paletteSources: ['#ff0000'],
    normalCandidates: [
      {
        id: 'normal:1',
        name: 'idle_0001_n.png',
        imageId: image.id,
      },
    ],
    warnings: [],
  }
}

describe('editor store frame operations', () => {
  beforeEach(() => {
    useEditorStore.setState({
      bundle: makeBundle(),
      warnings: [],
      selectedActionId: 'clip:1',
      currentFrameIndex: 0,
      isPlaying: false,
      settings: {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
      notice: undefined,
    })
  })

  it('renames, reorders and manually pairs a frame', () => {
    useEditorStore.getState().renameAction('clip:1', '待机')
    useEditorStore.getState().reorderFrames('clip:1', 0, 1)
    useEditorStore.getState().pairNormal('frame:1', useEditorStore.getState().bundle?.normalCandidates[0])

    const state = useEditorStore.getState()
    expect(state.bundle?.animations[0].name).toBe('待机')
    expect(state.bundle?.animations[0].frameIds).toEqual(['frame:2', 'frame:1'])
    expect(state.bundle?.frames[0].pairingStatus).toBe('manual')
    expect(state.warnings.some((warning) => warning.frameId === 'frame:2')).toBe(true)
  })
})