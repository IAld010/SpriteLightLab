import { describe, expect, it } from 'vitest'
import {
  constrainImageDataToRect,
  floodFillPixels,
  getLinePixels,
  setPixel,
  stampPixels,
} from '../domain/pixelToolkit'

function makeImageData(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData
}

describe('Piskel-adapted pixel toolkit', () => {
  it('fills fast diagonal pointer movement with a continuous pixel line', () => {
    const pixels = getLinePixels({ x: 0, y: 0 }, { x: 5, y: 3 })
    expect(pixels[0]).toEqual({ x: 0, y: 0 })
    expect(pixels.at(-1)).toEqual({ x: 5, y: 3 })
    for (let index = 1; index < pixels.length; index += 1) {
      expect(Math.abs(pixels[index].x - pixels[index - 1].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(pixels[index].y - pixels[index - 1].y)).toBeLessThanOrEqual(1)
    }
  })

  it('stamps square brush pixels around the cursor', () => {
    const image = makeImageData(8, 8)
    stampPixels(image, [{ x: 3, y: 3 }], 2, { r: 255, g: 0, b: 0, a: 255 })
    expect(Array.from(image.data.slice((3 * 8 + 3) * 4, (3 * 8 + 3) * 4 + 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(image.data.slice((2 * 8 + 2) * 4, (2 * 8 + 2) * 4 + 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(image.data.slice((2 * 8 + 3) * 4, (2 * 8 + 3) * 4 + 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(image.data.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4))).toEqual([0, 0, 0, 0])
  })

  it('keeps all pixels outside the selection unchanged', () => {
    const original = makeImageData(4, 4)
    const modified = makeImageData(4, 4)
    for (let index = 0; index < modified.data.length; index += 4) {
      modified.data.set([255, 0, 0, 255], index)
    }
    constrainImageDataToRect(original, modified, { x: 1, y: 1, width: 2, height: 2 })
    expect(Array.from(modified.data.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4))).toEqual([255, 0, 0, 255])
    const firstPixel = 0
    const lastPixel = (3 * 4 + 3) * 4
    expect(Array.from(modified.data.slice(firstPixel, firstPixel + 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(modified.data.slice(lastPixel, lastPixel + 4))).toEqual([0, 0, 0, 0])
  })

  it('flood fills only the connected target-color region', () => {
    const image = makeImageData(5, 5)
    const black = { r: 0, g: 0, b: 0, a: 255 }
    const red = { r: 255, g: 0, b: 0, a: 255 }
    setPixel(image, { x: 2, y: 2 }, black)
    const changed = floodFillPixels(image, { x: 0, y: 0 }, red)
    expect(changed).toBe(true)
    expect(Array.from(image.data.slice(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(image.data.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4))).toEqual([0, 0, 0, 255])
  })
})
