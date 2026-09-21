import { inferPaletteMode, rgbToHex } from './palette'
import type { AssetBundle } from './types'

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

async function readPixels(file: File): Promise<Uint8ClampedArray | undefined> {
  if (!('createImageBitmap' in globalThis)) {
    return undefined
  }
  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height
  try {
    if ('OffscreenCanvas' in globalThis) {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        return undefined
      }
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, width, height).data
    }

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        return undefined
      }
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, width, height).data
    }
    return undefined
  } finally {
    bitmap.close()
  }
}

export async function analyzeBundlePalette(bundle: AssetBundle): Promise<AssetBundle> {
  const colorImageIds = new Set(bundle.frames.map((frame) => frame.source.imageId))
  const colors = new Map<number, { r: number; g: number; b: number }>()

  try {
    for (const imageId of colorImageIds) {
      const image = bundle.images.find((candidate) => candidate.id === imageId)
      if (!image) {
        continue
      }
      const pixels = await readPixels(image.file)
      if (!pixels) {
        return { ...bundle, paletteMode: 'fullcolor', paletteSources: [] }
      }
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3]
        if (alpha < 8) {
          continue
        }
        const r = pixels[offset]
        const g = pixels[offset + 1]
        const b = pixels[offset + 2]
        const key = (r << 16) | (g << 8) | b
        colors.set(key, { r, g, b })
        if (colors.size > 256) {
          return { ...bundle, paletteMode: 'fullcolor', paletteSources: [] }
        }
      }
    }
  } catch {
    return { ...bundle, paletteMode: 'fullcolor', paletteSources: [] }
  }

  const paletteSources = [...colors.values()]
    .sort((left, right) => {
      const delta = luminance(left.r, left.g, left.b) - luminance(right.r, right.g, right.b)
      return Math.abs(delta) > 0.001
        ? delta
        : rgbToHex(left.r, left.g, left.b).localeCompare(rgbToHex(right.r, right.g, right.b))
    })
    .map((color) => rgbToHex(color.r, color.g, color.b))

  return {
    ...bundle,
    paletteMode: inferPaletteMode(paletteSources.length),
    paletteSources,
  }
}