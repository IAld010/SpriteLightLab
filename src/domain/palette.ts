import type {
  ColorAdjustments,
  ColorRule,
  PaletteEntry,
  PaletteMode,
  PalettePreset,
} from './types'

export interface RgbColor {
  r: number
  g: number
  b: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function normalizeHex(value: string, fallback = '#000000'): string {
  const trimmed = value.trim()
  const short = trimmed.match(/^#?([0-9a-f]{3})$/i)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const long = trimmed.match(/^#?([0-9a-f]{6})$/i)
  if (long) {
    return `#${long[1]}`.toLowerCase()
  }
  return fallback
}

export function hexToRgb(value: string): RgbColor {
  const hex = normalizeHex(value)
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function hexToRgbaFloat(value: string, alpha = 1): [number, number, number, number] {
  const { r, g, b } = hexToRgb(value)
  return [r / 255, g / 255, b / 255, alpha]
}

export function createColorAdjustments(): ColorAdjustments {
  return {
    hue: 0,
    saturation: 1,
    lightness: 0,
    contrast: 1,
    tint: '#ffffff',
    tintStrength: 0,
  }
}

export function createPalettePreset(
  id: string,
  name: string,
  sources: string[],
): PalettePreset {
  return {
    id,
    name,
    entries: sources.map((source) => ({ source, target: source })),
    rules: [],
    adjustments: createColorAdjustments(),
  }
}

export function mergePaletteSources(preset: PalettePreset, sources: string[]): PalettePreset {
  const targets = new Map(preset.entries.map((entry) => [entry.source, entry.target]))
  return {
    ...preset,
    entries: sources.map((source) => ({ source, target: targets.get(source) ?? source })),
  }
}

export function createColorRule(source = '#ffffff', target = '#ffffff'): ColorRule {
  return {
    id: `rule:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
    source: normalizeHex(source),
    target: normalizeHex(target),
    tolerance: 0.08,
    enabled: true,
  }
}

export function paletteSourcesFromEntries(entries: PaletteEntry[]): string[] {
  return entries.map((entry) => normalizeHex(entry.source))
}

export function buildPaletteLut(preset: PalettePreset, sourceColors: string[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  const targetBySource = new Map(
    preset.entries.map((entry) => [normalizeHex(entry.source), normalizeHex(entry.target)]),
  )

  for (let index = 0; index < 256; index += 1) {
    const source = sourceColors[index] ?? '#000000'
    const target = targetBySource.get(normalizeHex(source)) ?? normalizeHex(source)
    const { r, g, b } = hexToRgb(target)
    const offset = index * 4
    lut[offset] = r
    lut[offset + 1] = g
    lut[offset + 2] = b
    lut[offset + 3] = 255
  }

  return lut
}

export function parsePaletteFile(content: string, fileName = ''): string[] {
  const extension = fileName.toLowerCase().split('.').pop()
  if (extension === 'hex' || /(^|\n)#[0-9a-f]{6}/i.test(content)) {
    const colors = content
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((token) => /^#?[0-9a-f]{3,6}$/i.test(token))
      .map((token) => normalizeHex(token))
    return [...new Set(colors)]
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('GIMP Palette') && !line.startsWith('Name:') && !line.startsWith('Columns:'))
    .flatMap((line) => {
      const match = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/)
      if (!match) {
        return []
      }
      return [rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]))]
    })
    .filter((color, index, values) => values.indexOf(color) === index)
}

export function serializeGpl(colors: string[], name = 'Sprite Light Lab Palette'): string {
  const rows = colors.map((color) => {
    const { r, g, b } = hexToRgb(color)
    return `${String(r).padStart(3, ' ')} ${String(g).padStart(3, ' ')} ${String(b).padStart(3, ' ')}\t${normalizeHex(color)}`
  })
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${rows.join('\n')}\n`
}

export function serializeHexPalette(colors: string[]): string {
  return `${colors.map((color) => normalizeHex(color)).join('\n')}\n`
}

export function inferPaletteMode(colorCount: number): PaletteMode {
  return colorCount > 0 && colorCount <= 256 ? 'indexed' : 'fullcolor'
}

export function colorDistance(left: string, right: string): number {
  const a = hexToRgb(left)
  const b = hexToRgb(right)
  return Math.sqrt(
    ((a.r - b.r) / 255) ** 2 +
      ((a.g - b.g) / 255) ** 2 +
      ((a.b - b.b) / 255) ** 2,
  )
}