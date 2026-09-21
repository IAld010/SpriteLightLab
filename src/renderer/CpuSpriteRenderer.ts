import { buildPaletteLut, hexToRgb } from '../domain/palette'
import type {
  ColorAdjustments,
  ColorRule,
  LightSource,
  LightingState,
  PaletteMode,
  PalettePreset,
  RenderPreferences,
} from '../domain/types'

export interface CpuRenderInput {
  color: ImageData
  normal: ImageData
  index: ImageData
  frame: { x: number; y: number; width: number; height: number }
  outputWidth: number
  outputHeight: number
  paletteMode: PaletteMode
  paletteSources: string[]
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
  objectRect: [number, number, number, number]
  debugNormal?: boolean
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue /= 6
    if (hue < 0) hue += 1
  }
  return [hue, max === 0 ? 0 : delta / max, max]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

function adjustColor(r: number, g: number, b: number, adjustments: ColorAdjustments): [number, number, number] {
  let [h, s, v] = rgbToHsv(r, g, b)
  h = (h + adjustments.hue / 360 + 1) % 1
  s = clamp(s * adjustments.saturation)
  let color = hsvToRgb(h, s, v)
  color = color.map((value) => clamp((value - 0.5) * adjustments.contrast + 0.5 + adjustments.lightness)) as [number, number, number]
  const tint = hexToRgb(adjustments.tint)
  const tr = tint.r / 255
  const tg = tint.g / 255
  const tb = tint.b / 255
  return [
    color[0] + (tr - color[0]) * adjustments.tintStrength,
    color[1] + (tg - color[1]) * adjustments.tintStrength,
    color[2] + (tb - color[2]) * adjustments.tintStrength,
  ]
}

function applyRules(color: [number, number, number], rules: ColorRule[]): [number, number, number] {
  let output = color
  for (const rule of rules) {
    if (!rule.enabled) continue
    const source = hexToRgb(rule.source)
    const target = hexToRgb(rule.target)
    const distance = Math.sqrt(
      ((output[0] * 255 - source.r) / 255) ** 2 +
        ((output[1] * 255 - source.g) / 255) ** 2 +
        ((output[2] * 255 - source.b) / 255) ** 2,
    )
    const edgeStart = rule.tolerance * 0.78
    const weight = distance <= edgeStart ? 1 : distance >= rule.tolerance ? 0 : 1 - (distance - edgeStart) / (rule.tolerance - edgeStart)
    output = [
      output[0] + (target.r / 255 - output[0]) * weight,
      output[1] + (target.g / 255 - output[1]) * weight,
      output[2] + (target.b / 255 - output[2]) * weight,
    ]
  }
  return output
}

function toLinear(value: number): number {
  return value ** 2.2
}

function toSrgb(value: number): number {
  return clamp(value) ** (1 / 2.2)
}

function lightContribution(
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  light: LightSource,
  objectRect: [number, number, number, number],
): number {
  const localX = objectRect[2] > 0 ? (light.x - objectRect[0]) / objectRect[2] : 0
  const localY = objectRect[3] > 0 ? (light.y - objectRect[1]) / objectRect[3] : 0
  const aspect = 1
  let directionX = 0
  let directionY = 0
  let attenuation = 1
  let cone = 1
  if (light.type === 'directional') {
    const radians = (light.direction * Math.PI) / 180
    directionX = -Math.cos(radians)
    directionY = -Math.sin(radians)
  } else {
    const deltaX = (localX - x) * aspect
    const deltaY = localY - y
    const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 0.0001)
    const radius = Math.max(light.radius, 0.0001)
    attenuation = Math.max(1 - distance / radius, 0) ** Math.max(light.falloff, 0.1)
    const inverseDistance = 1 / distance
    directionX = deltaX * inverseDistance
    directionY = deltaY * inverseDistance
    if (light.type === 'spot') {
      const radians = (light.direction * Math.PI) / 180
      const rayX = Math.cos(radians)
      const rayY = Math.sin(radians)
      const toPixelX = -directionX
      const toPixelY = -directionY
      const dot = rayX * toPixelX + rayY * toPixelY
      const inner = Math.cos((light.innerAngle * Math.PI) / 360)
      const outer = Math.cos((light.outerAngle * Math.PI) / 360)
      cone = clamp((dot - outer) / Math.max(inner - outer, 0.0001))
      cone = cone * cone * (3 - 2 * cone)
    }
  }
  const z = light.type === 'directional' ? 0.78 : 0.7
  const directionLength = Math.sqrt(directionX * directionX + directionY * directionY + z * z)
  const lx = directionX / directionLength
  const ly = directionY / directionLength
  const lz = z / directionLength
  const diffuse = Math.max(normalX * lx + normalY * ly + normalZ * lz, 0)
  let contribution = light.intensity * diffuse * attenuation * cone
  if (light.type !== 'directional' && (x - localX) ** 2 + (y - localY) ** 2 > light.radius ** 2) {
    contribution = 0
  }
  return contribution
}

export function renderCpuSprite(input: CpuRenderInput): HTMLCanvasElement {
  const { frame, color, normal, outputWidth, outputHeight } = input
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to create CPU render canvas.')
  const output = context.createImageData(outputWidth, outputHeight)
  const lut = buildPaletteLut(input.palette, input.paletteSources)
  const paletteIndexByColor = new Map<number, number>()
  input.paletteSources.forEach((source, sourceIndex) => {
    const rgb = hexToRgb(source)
    paletteIndexByColor.set((rgb.r << 16) | (rgb.g << 8) | rgb.b, sourceIndex)
  })

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = Math.min(frame.x + Math.floor((x / outputWidth) * frame.width), frame.x + frame.width - 1)
      const sourceY = Math.min(frame.y + Math.floor((y / outputHeight) * frame.height), frame.y + frame.height - 1)
      const sourceOffset = (sourceY * color.width + sourceX) * 4
      const alpha = color.data[sourceOffset + 3]
      const outputOffset = (y * outputWidth + x) * 4
      if (alpha < 1) {
        output.data[outputOffset + 3] = 0
        continue
      }

      if (input.debugNormal) {
        const normalOffset = (sourceY * normal.width + sourceX) * 4
        output.data[outputOffset] = normal.data[normalOffset]
        output.data[outputOffset + 1] = normal.data[normalOffset + 1]
        output.data[outputOffset + 2] = normal.data[normalOffset + 2]
        output.data[outputOffset + 3] = alpha
        continue
      }

      let red = color.data[sourceOffset] / 255
      let green = color.data[sourceOffset + 1] / 255
      let blue = color.data[sourceOffset + 2] / 255

      if (input.paletteMode === 'indexed') {
        const key = (color.data[sourceOffset] << 16) | (color.data[sourceOffset + 1] << 8) | color.data[sourceOffset + 2]
        const paletteIndex = paletteIndexByColor.get(key) ?? 0
        const lutOffset = paletteIndex * 4
        red = lut[lutOffset] / 255
        green = lut[lutOffset + 1] / 255
        blue = lut[lutOffset + 2] / 255
      } else {
        ;[red, green, blue] = applyRules([red, green, blue], input.palette.rules)
      }

      ;[red, green, blue] = adjustColor(red, green, blue, input.palette.adjustments)

      if (input.preferences.lightingEnabled) {
        const normalOffset = (sourceY * normal.width + sourceX) * 4
        let normalX = (normal.data[normalOffset] / 255) * 2 - 1
        let normalY = (normal.data[normalOffset + 1] / 255) * 2 - 1
        let normalZ = (normal.data[normalOffset + 2] / 255) * 2 - 1
        if (input.preferences.flipGreen) normalY *= -1
        normalX *= input.preferences.normalStrength
        normalY *= input.preferences.normalStrength
        const normalLength = Math.max(Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ), 0.0001)
        normalX /= normalLength
        normalY /= normalLength
        normalZ /= normalLength

        const ambient = hexToRgb(input.lighting.ambientColor)
        let lightRed = toLinear(ambient.r / 255) * input.lighting.ambientIntensity
        let lightGreen = toLinear(ambient.g / 255) * input.lighting.ambientIntensity
        let lightBlue = toLinear(ambient.b / 255) * input.lighting.ambientIntensity

        for (const light of input.lighting.lights) {
          if (!light.enabled) continue
          const contribution = lightContribution(
            (x + 0.5) / outputWidth,
            (y + 0.5) / outputHeight,
            normalX,
            normalY,
            normalZ,
            light,
            input.objectRect,
          )
          if (contribution <= 0) continue
          const lightColor = hexToRgb(light.color)
          lightRed += toLinear(lightColor.r / 255) * contribution
          lightGreen += toLinear(lightColor.g / 255) * contribution
          lightBlue += toLinear(lightColor.b / 255) * contribution
        }

        red = toSrgb(toLinear(red) * lightRed)
        green = toSrgb(toLinear(green) * lightGreen)
        blue = toSrgb(toLinear(blue) * lightBlue)
      }

      output.data[outputOffset] = Math.round(clamp(red) * 255)
      output.data[outputOffset + 1] = Math.round(clamp(green) * 255)
      output.data[outputOffset + 2] = Math.round(clamp(blue) * 255)
      output.data[outputOffset + 3] = alpha
    }
  }

  context.putImageData(output, 0, 0)
  return canvas
}