import { describe, expect, it } from 'vitest'
import { importFiles, updateFrameNormal } from '../domain/importAssets'

const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8n8sAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
)

function png(name: string): File {
  return new File([PNG_1X1], name, { type: 'image/png' })
}

describe('importFiles', () => {
  it('imports frame files and pairs a sidecar normal', async () => {
    const bundle = await importFiles([png('idle_0001.png'), png('idle_0001_n.png')])

    expect(bundle.mode).toBe('frames')
    expect(bundle.frames).toHaveLength(1)
    expect(bundle.frames[0].pairingStatus).toBe('matched')
    expect(bundle.animations[0].name).toBe('idle')
  })

  it('imports an atlas JSON with an image and assumes an aligned normal image', async () => {
    const atlas = new File(
      [
        JSON.stringify({
          frames: [{ filename: 'idle_0001.png', frame: { x: 0, y: 0, w: 1, h: 1 } }],
          meta: { image: 'character.png', size: { w: 1, h: 1 } },
        }),
      ],
      'character.json',
      { type: 'application/json' },
    )
    const bundle = await importFiles([png('character.png'), png('character_n.png'), atlas])

    expect(bundle.mode).toBe('atlas')
    expect(bundle.frames).toHaveLength(1)
    expect(bundle.frames[0].normal).toBeDefined()
    expect(bundle.warnings.some((warning) => warning.code === 'assumed-normal-layout')).toBe(true)
  })

  it('clears and restores a manual normal pairing', async () => {
    const bundle = await importFiles([png('idle_0001.png'), png('idle_0001_n.png')])
    const frameId = bundle.frames[0].id
    const cleared = updateFrameNormal(bundle, frameId, undefined)
    const restored = updateFrameNormal(cleared, frameId, bundle.normalCandidates[0])

    expect(cleared.frames[0].pairingStatus).toBe('missing')
    expect(restored.frames[0].pairingStatus).toBe('manual')
  })
})