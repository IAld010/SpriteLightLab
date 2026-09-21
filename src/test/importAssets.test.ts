import { describe, expect, it } from 'vitest'
import { importFiles, importGridFiles, updateFrameNormal } from '../domain/importAssets'

const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8n8sAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
)

function png(name: string): File {
  return new File([PNG_1X1], name, { type: 'image/png' })
}

function pngWithWidth(name: string, width: number): File {
  const bytes = PNG_1X1.slice()
  new DataView(bytes.buffer).setUint32(16, width)
  return new File([bytes], name, { type: 'image/png' })
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

  it('blocks an atlas normal image whose dimensions differ from the color atlas', async () => {
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

    const bundle = await importFiles([
      png('character.png'),
      pngWithWidth('character_n.png', 2),
      atlas,
    ])

    expect(bundle.frames[0].normal).toBeUndefined()
    expect(bundle.frames[0].pairingStatus).toBe('mismatch')
    expect(bundle.warnings.some((warning) => warning.code === 'normal-image-size-mismatch')).toBe(true)
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
describe('importGridFiles', () => {
  it('imports an explicitly selected 1x1 grid pair', async () => {
    const bundle = await importGridFiles(
      png('hero.png'),
      png('hero_normal.png'),
      {
        frameWidth: 1,
        frameHeight: 1,
        columns: 1,
        rows: 1,
        offsetX: 0,
        offsetY: 0,
        spacingX: 0,
        spacingY: 0,
        frameOrder: 'row-major',
      },
    )

    expect(bundle.mode).toBe('grid')
    expect(bundle.frames).toHaveLength(1)
    expect(bundle.frames[0].pairingStatus).toBe('matched')
  })
})
  it('blocks manual pairing when the selected normal has a different size', async () => {
    const bundle = await importFiles([png('idle_0001.png'), png('idle_0001_n.png')])
    const mismatchedFile = pngWithWidth('wrong_normal.png', 2)
    const mismatchedImage = {
      id: 'wrong-normal',
      name: mismatchedFile.name,
      path: mismatchedFile.name,
      file: mismatchedFile,
      width: 2,
      height: 1,
    }
    bundle.images.push(mismatchedImage)
    const candidate = {
      id: 'candidate:wrong',
      name: mismatchedFile.name,
      imageId: mismatchedImage.id,
    }

    const updated = updateFrameNormal(bundle, bundle.frames[0].id, candidate)

    expect(updated.frames[0].normal).toBeUndefined()
    expect(updated.frames[0].pairingStatus).toBe('mismatch')
    expect(updated.warnings.some((warning) => warning.code === 'normal-pairing-size-mismatch')).toBe(true)
  })