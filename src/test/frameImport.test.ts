import { describe, expect, it } from 'vitest'
import { groupFramesIntoAnimations, pairFrameImages } from '../domain/frameImport'
import type { RuntimeImage } from '../domain/types'

let sequence = 0

function image(name: string): RuntimeImage {
  sequence += 1
  return {
    id: `${name}:${sequence}`,
    name,
    path: name,
    file: new File(['pixel'], name, { type: 'image/png' }),
    width: 32,
    height: 32,
  }
}

describe('pairFrameImages', () => {
  it('pairs sidecar normals by _n and _normal naming', () => {
    const colors = [image('idle_0001.png'), image('idle_0002.png'), image('walk_0001.png')]
    const normals = [
      image('idle_0001_n.png'),
      image('idle_0002_normal.png'),
      image('walk_0001_n.png'),
    ]

    const result = pairFrameImages(colors, normals)

    expect(result.frames).toHaveLength(3)
    expect(result.frames.every((frame) => frame.pairingStatus === 'matched')).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('pairs diffuse and normal numbered sequences from common sprite packs', () => {
    const colors = [image('bopz_walk_diffuse_001.png'), image('bopz_walk_diffuse_002.png')]
    const normals = [image('bopz_walk_normal_001.png'), image('bopz_walk_normal_002.png')]

    const result = pairFrameImages(colors, normals)
    const clips = groupFramesIntoAnimations(result.frames)

    expect(result.frames.every((frame) => frame.pairingStatus === 'matched')).toBe(true)
    expect(clips).toHaveLength(1)
    expect(clips[0].name).toBe('bopz_walk')
  })

  it('keeps missing frames previewable and reports unpaired normals', () => {
    const colors = [image('idle_0001.png'), image('idle_0002.png')]
    const normals = [image('idle_0001_n.png'), image('unused_n.png')]

    const result = pairFrameImages(colors, normals)

    expect(result.frames[0].normal?.name).toBe('idle_0001_n.png')
    expect(result.frames[1].pairingStatus).toBe('missing')
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['missing-normal', 'unpaired-normal']),
    )
  })
})

describe('groupFramesIntoAnimations', () => {
  it('groups numbered frame sequences into clips', () => {
    const paired = pairFrameImages(
      [
        image('idle_0001.png'),
        image('idle_0002.png'),
        image('walk_0001.png'),
        image('walk_0002.png'),
      ],
      [],
    )

    const clips = groupFramesIntoAnimations(paired.frames, 12)

    expect(clips.map((clip) => clip.name)).toEqual(['idle', 'walk'])
    expect(clips[0].frameIds).toHaveLength(2)
    expect(clips[0].fps).toBe(12)
    expect(clips[1].frameIds).toHaveLength(2)
  })
})