import { describe, expect, it } from 'vitest'
import { packSheet, placementMap } from '../domain/spriteSheet'

describe('sprite sheet packing', () => {
  it('wraps frames into rows once the sheet width is exceeded', () => {
    const layout = packSheet(
      [
        { key: 'a', width: 64, height: 64 },
        { key: 'b', width: 64, height: 128 },
        { key: 'c', width: 128, height: 128 },
      ],
      { maxWidth: 160 },
    )

    expect(layout.placements).toEqual([
      { key: 'a', x: 0, y: 0, width: 64, height: 64 },
      { key: 'b', x: 64, y: 0, width: 64, height: 128 },
      { key: 'c', x: 0, y: 128, width: 128, height: 128 },
    ])
    expect({ width: layout.width, height: layout.height }).toEqual({ width: 128, height: 256 })
  })

  it('reserves a gutter when padding is requested', () => {
    const layout = packSheet(
      [
        { key: 'a', width: 64, height: 64 },
        { key: 'b', width: 64, height: 128 },
        { key: 'c', width: 128, height: 128 },
      ],
      { maxWidth: 160, padding: 2 },
    )

    expect(layout.placements.map((placement) => [placement.key, placement.x, placement.y])).toEqual([
      ['a', 0, 0],
      ['b', 66, 0],
      ['c', 0, 130],
    ])
    expect({ width: layout.width, height: layout.height }).toEqual({ width: 130, height: 258 })
  })

  it('keeps a frame wider than the sheet limit on its own row', () => {
    const layout = packSheet([{ key: 'wide', width: 200, height: 32 }], { maxWidth: 32 })

    expect(layout.placements).toEqual([{ key: 'wide', x: 0, y: 0, width: 200, height: 32 }])
    expect({ width: layout.width, height: layout.height }).toEqual({ width: 200, height: 32 })
  })

  it('reports a minimal sheet for empty input and clamps invalid sizes', () => {
    expect(packSheet([])).toEqual({ width: 1, height: 1, placements: [] })

    const layout = packSheet([{ key: 'odd', width: 0, height: Number.NaN }])
    expect(layout.placements).toEqual([{ key: 'odd', x: 0, y: 0, width: 1, height: 1 }])
  })

  it('exposes placements by frame key', () => {
    const layout = packSheet([{ key: 'a', width: 8, height: 8 }])
    expect(placementMap(layout).get('a')).toEqual({ key: 'a', x: 0, y: 0, width: 8, height: 8 })
  })
})
