import { buildPaletteLut, hexToRgb } from '../domain/palette'
import { lightPointToObject, type ObjectRect } from './lightingGeometry'
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
  objectRect: ObjectRect
  debugNormal?: boolean
  /** RGBA refinement overlay already composited in the frame's native pixel space. */
  refinementOverlay?: ImageData
  /** Source color texture visibility. Lighting still uses the original alpha region. */
  sourceVisible?: boolean
  sourceOpacity?: number
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

interface LightSample {
  diffuse: number
  specular: number
}

export function decodeNormalChannel(value: number): number {
  const decoded = (value / 255) * 2 - 1
  return Math.abs(decoded) < 0.01 ? 0 : decoded
}
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value <= edge0 ? 0 : 1
  const t = clamp((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function lightContribution(
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  frameAspect: number,
  light: LightSource,
  objectRect: ObjectRect,
): LightSample {
  const aspect = Math.max(frameAspect, 0.0001)
  let directionX = 0
  let directionY = 0
  let attenuation = 1
  let cone = 1

  if (light.type === 'directional') {
    const radians = (light.direction * Math.PI) / 180
    directionX = -Math.cos(radians)
    directionY = -Math.sin(radians)
  } else {
    const [lightX, lightY] = lightPointToObject(light.x, light.y, objectRect)
    const deltaX = lightX - x
    const deltaY = (lightY - y) / aspect
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    const radius = Math.max(light.radius, 0.0001)
    if (distance > radius) {
      return { diffuse: 0, specular: 0 }
    }

    const distanceRatio = distance / radius
    attenuation =
      1 /
      (0.75 +
        3 * distanceRatio +
        Math.max(light.falloff, 0.1) * distanceRatio * distanceRatio)

    directionX = -deltaX
    directionY = -deltaY

    if (light.type === 'spot' && distance > 0.0001) {
      const radians = (light.direction * Math.PI) / 180
      const rayX = Math.cos(radians)
      const rayY = Math.sin(radians)
      const pixelDirectionX = -deltaX / distance
      const pixelDirectionY = -deltaY / distance
      const dot = clamp(rayX * pixelDirectionX + rayY * pixelDirectionY, -1, 1)
      const angle = Math.acos(dot)
      const halfAngle = (light.coneAngle * Math.PI) / 360
      const softAngle = halfAngle * (1 - clamp(light.softness))
      cone = angle >= halfAngle ? 0 : angle <= softAngle ? 1 : 1 - smoothstep(softAngle, halfAngle, angle)
    }
  }

  const surfaceZ = light.type === 'directional' ? 0.78 : 0.075
  const directionLength = Math.sqrt(
    directionX * directionX + directionY * directionY + surfaceZ * surfaceZ,
  )
  const lightX = directionX / directionLength
  const lightY = directionY / directionLength
  const lightZ = surfaceZ / directionLength
  const diffuse = Math.max(normalX * lightX + normalY * lightY + normalZ * lightZ, 0)
  const contribution = light.intensity * diffuse * attenuation * cone
  if (contribution <= 0) {
    return { diffuse: 0, specular: 0 }
  }

  const halfX = lightX
  const halfY = lightY
  const halfZ = lightZ + 1
  const halfLength = Math.max(Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ), 0.0001)
  const specularDot = clamp(
    normalX * (halfX / halfLength) +
      normalY * (halfY / halfLength) +
      normalZ * (halfZ / halfLength),
  )
  return {
    diffuse: contribution,
    specular: specularDot ** 32 * light.intensity * attenuation * cone,
  }
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
      const outputOffset = (y * outputWidth + x) * 4
      const originalAlpha = color.data[sourceOffset + 3] / 255
      const sourceOpacity = Math.min(1, Math.max(0, input.sourceOpacity ?? 1))
      const sourceAlpha = input.sourceVisible === false ? 0 : originalAlpha * sourceOpacity
      const overlay = input.refinementOverlay
      const hasOverlay =
        overlay &&
        overlay.width === outputWidth &&
        overlay.height === outputHeight
      const overlayAlpha = hasOverlay ? overlay.data[outputOffset + 3] / 255 : 0
      const finalAlpha = overlayAlpha + sourceAlpha * (1 - overlayAlpha)
      if (finalAlpha < 1 / 255) {
        output.data[outputOffset + 3] = 0
        continue
      }

      if (input.debugNormal && originalAlpha >= 1 / 255) {
        const normalOffset = (sourceY * normal.width + sourceX) * 4
        output.data[outputOffset] = normal.data[normalOffset]
        output.data[outputOffset + 1] = normal.data[normalOffset + 1]
        output.data[outputOffset + 2] = normal.data[normalOffset + 2]
        output.data[outputOffset + 3] = originalAlpha * 255
        continue
      }

      let red = color.data[sourceOffset] / 255
      let green = color.data[sourceOffset + 1] / 255
      let blue = color.data[sourceOffset + 2] / 255

      if (sourceAlpha >= 1 / 255) {
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
      }

      if (hasOverlay && overlayAlpha > 0) {
        const overlayRed = overlay.data[outputOffset] / 255
        const overlayGreen = overlay.data[outputOffset + 1] / 255
        const overlayBlue = overlay.data[outputOffset + 2] / 255
        const sourceWeight = sourceAlpha * (1 - overlayAlpha)
        red = (overlayRed * overlayAlpha + red * sourceWeight) / finalAlpha
        green = (overlayGreen * overlayAlpha + green * sourceWeight) / finalAlpha
        blue = (overlayBlue * overlayAlpha + blue * sourceWeight) / finalAlpha
      }

      if (input.debugNormal && originalAlpha < 1 / 255) {
        output.data[outputOffset] = hasOverlay ? overlay.data[outputOffset] : 0
        output.data[outputOffset + 1] = hasOverlay ? overlay.data[outputOffset + 1] : 0
        output.data[outputOffset + 2] = hasOverlay ? overlay.data[outputOffset + 2] : 0
        output.data[outputOffset + 3] = finalAlpha * 255
        continue
      }

      if (input.preferences.lightingEnabled && originalAlpha >= 1 / 255) {
        const normalOffset = (sourceY * normal.width + sourceX) * 4
        let normalX = decodeNormalChannel(normal.data[normalOffset])
        let normalY = decodeNormalChannel(normal.data[normalOffset + 1])
        let normalZ = decodeNormalChannel(normal.data[normalOffset + 2])
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
        let specularRed = 0
        let specularGreen = 0
        let specularBlue = 0
        const specularStrength = input.preferences.specularEnabled
          ? input.preferences.specularStrength
          : 0

        for (const light of input.lighting.lights) {
          if (!light.enabled) continue
          const sample = lightContribution(
            (x + 0.5) / outputWidth,
            (y + 0.5) / outputHeight,
            normalX,
            normalY,
            normalZ,
            outputWidth / outputHeight,
            light,
            input.objectRect,
          )
          if (sample.diffuse <= 0) continue
          const lightColor = hexToRgb(light.color)
          const linearRed = toLinear(lightColor.r / 255)
          const linearGreen = toLinear(lightColor.g / 255)
          const linearBlue = toLinear(lightColor.b / 255)
          lightRed += linearRed * sample.diffuse
          lightGreen += linearGreen * sample.diffuse
          lightBlue += linearBlue * sample.diffuse
          if (specularStrength > 0) {
            const highlight = sample.specular * specularStrength
            specularRed += linearRed * highlight
            specularGreen += linearGreen * highlight
            specularBlue += linearBlue * highlight
          }
        }

        red = toSrgb(toLinear(red) * lightRed + specularRed)
        green = toSrgb(toLinear(green) * lightGreen + specularGreen)
        blue = toSrgb(toLinear(blue) * lightBlue + specularBlue)
      }

      output.data[outputOffset] = Math.round(clamp(red) * 255)
      output.data[outputOffset + 1] = Math.round(clamp(green) * 255)
      output.data[outputOffset + 2] = Math.round(clamp(blue) * 255)
      output.data[outputOffset + 3] = Math.round(clamp(finalAlpha) * 255)
    }
  }

  context.putImageData(output, 0, 0)
  return canvas
}
