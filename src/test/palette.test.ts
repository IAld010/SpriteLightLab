import { describe, expect, it } from 'vitest'
import {
  buildPaletteLut,
  createPalettePreset,
  normalizeHex,
  parsePaletteFile,
  serializeGpl,
  serializeHexPalette,
} from '../domain/palette'

describe('palette utilities', () => {
  it('normalizes colors and builds an indexed LUT', () => {
    const preset = createPalettePreset('p:1', 'test', ['#ff0000', '#00ff00'])
    preset.entries[0].target = '#0000ff'
    const lut = buildPaletteLut(preset, ['#ff0000', '#00ff00'])

    expect(normalizeHex('#f00')).toBe('#ff0000')
    expect([...lut.slice(0, 4)]).toEqual([0, 0, 255, 255])
    expect([...lut.slice(4, 8)]).toEqual([0, 255, 0, 255])
  })

  it('round-trips GPL and HEX palettes', () => {
    const colors = ['#112233', '#abcdef']
    const gpl = serializeGpl(colors, '测试色板')
    const hex = serializeHexPalette(colors)

    expect(parsePaletteFile(gpl, 'palette.gpl')).toEqual(colors)
    expect(parsePaletteFile(hex, 'palette.hex')).toEqual(colors)
  })
})