import { describe, expect, it } from 'vitest'
import { AtlasParseError, parseAtlasJson, validateAtlasLayout } from '../domain/atlasParser'

const asepriteJson = JSON.stringify({
  frames: {
    'idle_0001.png': { frame: { x: 0, y: 0, w: 32, h: 32 }, duration: 100 },
    'idle_0002.png': { frame: { x: 32, y: 0, w: 32, h: 32 }, duration: 120 },
  },
  meta: {
    image: 'character.png',
    size: { w: 64, h: 32 },
    frameTags: [{ name: 'idle', from: 0, to: 1 }],
  },
})

describe('parseAtlasJson', () => {
  it('parses Aseprite frames and frame tags', () => {
    const atlas = parseAtlasJson(asepriteJson, 'character.json')

    expect(atlas.schema).toBe('aseprite')
    expect(atlas.imageName).toBe('character.png')
    expect(atlas.frames).toHaveLength(2)
    expect(atlas.animations).toEqual([
      { name: 'idle', frameNames: ['idle_0001.png', 'idle_0002.png'] },
    ])
  })

  it('throws a readable error for malformed data', () => {
    expect(() => parseAtlasJson('{ broken', 'broken.json')).toThrow(AtlasParseError)
    expect(() => parseAtlasJson('{"frames":[]}', 'empty.json')).toThrow(
      '未找到有效的 frames 数据',
    )
  })
})

describe('validateAtlasLayout', () => {
  it('reports frame-count and rect mismatch', () => {
    const color = parseAtlasJson(asepriteJson, 'color.json')
    const normal = parseAtlasJson(
      JSON.stringify({
        frames: [
          { filename: 'idle_0001.png', frame: { x: 1, y: 0, w: 31, h: 32 } },
          { filename: 'idle_0002.png', frame: { x: 32, y: 0, w: 32, h: 32 } },
        ],
      }),
      'normal.json',
    )

    const issues = validateAtlasLayout(color, normal)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('第 1 帧')
  })
})