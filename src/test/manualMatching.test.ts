import { describe, expect, it } from 'vitest'
import { applyManualMatching, createMatchingWorkspace } from '../domain/manualMatching'
import type { AssetBundle } from '../domain/types'

function makeBundle(): AssetBundle {
  const colorFile = new File(['color'], 'hero_0001.png', { type: 'image/png' })
  const secondColorFile = new File(['color2'], 'hero_0002.png', { type: 'image/png' })
  const normalFile = new File(['normal'], 'hero_0001_n.png', { type: 'image/png' })
  const unmatchedNormalFile = new File(['normal2'], 'other_normal.png', { type: 'image/png' })
  const images = [
    { id: 'color:1', name: colorFile.name, path: colorFile.name, file: colorFile, width: 32, height: 32 },
    { id: 'color:2', name: secondColorFile.name, path: secondColorFile.name, file: secondColorFile, width: 32, height: 32 },
    { id: 'normal:1', name: normalFile.name, path: normalFile.name, file: normalFile, width: 32, height: 32 },
    { id: 'normal:2', name: unmatchedNormalFile.name, path: unmatchedNormalFile.name, file: unmatchedNormalFile, width: 32, height: 32 },
  ]
  return {
    id: 'bundle:manual',
    mode: 'frames',
    sourceName: 'hero',
    importedAt: new Date(0).toISOString(),
    images,
    frames: [
      {
        id: 'frame:1',
        name: 'hero_0001',
        source: { id: 'source:1', name: colorFile.name, imageId: 'color:1' },
        normal: { id: 'normal-ref:1', name: normalFile.name, imageId: 'normal:1' },
        pairingStatus: 'matched',
      },
      {
        id: 'frame:2',
        name: 'hero_0002',
        source: { id: 'source:2', name: secondColorFile.name, imageId: 'color:2' },
        pairingStatus: 'missing',
      },
    ],
    animations: [{ id: 'clip:1', name: 'hero', frameIds: ['frame:1', 'frame:2'], fps: 8, loop: true }],
    normalCandidates: [
      { id: 'normal-ref:1', name: normalFile.name, imageId: 'normal:1' },
      { id: 'normal-ref:2', name: unmatchedNormalFile.name, imageId: 'normal:2' },
    ],
    paletteMode: 'fullcolor',
    paletteSources: [],
    warnings: [],
  }
}

describe('manual matching', () => {
  it('prefills successful automatic pairs and leaves unmatched images in pools', () => {
    const workspace = createMatchingWorkspace(makeBundle())

    expect(workspace.rows).toHaveLength(1)
    expect(workspace.rows[0].sourceFrameId).toBe('frame:1')
    expect(workspace.rows[0].normalCandidateId).toBe('normal-ref:1')
    expect(workspace.unpairedSourceIds).toEqual(['frame:2'])
    expect(workspace.unpairedNormalIds).toEqual(['normal-ref:2'])
  })

  it('creates a manual pair from a dropped color and normal image', () => {
    const bundle = makeBundle()
    const applied = applyManualMatching(bundle, [
      { id: 'row:1', sourceFrameId: 'frame:1', normalCandidateId: 'normal-ref:1' },
      { id: 'row:2', sourceFrameId: 'frame:2', normalCandidateId: 'normal-ref:2' },
    ])

    expect(applied.frames).toHaveLength(2)
    expect(applied.frames[1].normal?.id).toBe('normal-ref:2')
    expect(applied.frames[1].pairingStatus).toBe('manual')
    expect(applied.animations[0].frameIds).toEqual(['frame:1', 'frame:2'])
  })
})