import { describe, expect, it } from 'vitest'
import { createRegionBundle, detectRegionsFromImageData } from '../domain/regionImport'

function createImageData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as ImageData
}

function fillRect(image: ImageData, x: number, y: number, width: number, height: number) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * image.width + px) * 4
      image.data[offset] = 255
      image.data[offset + 1] = 255
      image.data[offset + 2] = 255
      image.data[offset + 3] = 255
    }
  }
}

const baseOptions = {
  alphaThreshold: 1,
  backgroundMode: 'transparent' as const,
  backgroundColor: '#000000',
  colorTolerance: 0,
  minRegionWidth: 1,
  minRegionHeight: 1,
  mergeDistance: 0,
  padding: 0,
}

describe('region import detection', () => {
  it('detects unrelated rectangular frames at arbitrary positions', () => {
    const image = createImageData(64, 64)
    fillRect(image, 2, 3, 10, 12)
    fillRect(image, 30, 5, 8, 9)
    fillRect(image, 4, 40, 20, 15)

    expect(detectRegionsFromImageData(image, baseOptions)).toEqual([
      { x: 2, y: 3, width: 10, height: 12 },
      { x: 30, y: 5, width: 8, height: 9 },
      { x: 4, y: 40, width: 20, height: 15 },
    ])
  })

  it('detects regions on an opaque solid background', () => {
    const image = createImageData(32, 32)
    for (let offset = 0; offset < image.data.length; offset += 4) {
      image.data[offset] = 255
      image.data[offset + 3] = 255
    }
    for (let y = 5; y < 15; y += 1) {
      for (let x = 6; x < 18; x += 1) {
        const offset = (y * image.width + x) * 4
        image.data[offset] = 0
        image.data[offset + 1] = 0
        image.data[offset + 2] = 255
      }
    }

    expect(
      detectRegionsFromImageData(image, {
        ...baseOptions,
        backgroundMode: 'color',
        backgroundColor: '#ff0000',
        colorTolerance: 0,
      }),
    ).toEqual([{ x: 6, y: 5, width: 12, height: 10 }])
  })

  it('merges nearby detached pixels for one character', () => {
    const image = createImageData(40, 40)
    fillRect(image, 10, 10, 10, 10)
    fillRect(image, 23, 12, 1, 1)

    expect(detectRegionsFromImageData(image, { ...baseOptions, mergeDistance: 3 })).toEqual([
      { x: 10, y: 10, width: 14, height: 10 },
    ])
  })

  it('applies padding and filters tiny regions', () => {
    const image = createImageData(40, 40)
    fillRect(image, 3, 4, 2, 2)
    fillRect(image, 20, 20, 8, 10)

    expect(
      detectRegionsFromImageData(image, {
        ...baseOptions,
        minRegionWidth: 4,
        minRegionHeight: 4,
        padding: 2,
      }),
    ).toEqual([{ x: 18, y: 18, width: 12, height: 14 }])
  })
})

it('creates different-sized color and normal frames from region rectangles', () => {
  const colorFile = new File(['color'], 'sheet_color.png', { type: 'image/png' })
  const normalFile = new File(['normal'], 'sheet_normal.png', { type: 'image/png' })
  const regions = [
    { x: 10, y: 10, width: 20, height: 30 },
    { x: 60, y: 20, width: 30, height: 50 },
  ]
  const bundle = createRegionBundle({
    colorImage: { id: 'color', name: colorFile.name, path: colorFile.name, file: colorFile, width: 128, height: 128 },
    normalImage: { id: 'normal', name: normalFile.name, path: normalFile.name, file: normalFile, width: 128, height: 128 },
    config: {
      alphaThreshold: 1,
      backgroundMode: 'transparent',
      backgroundColor: '#000000',
      colorTolerance: 0,
      minRegionWidth: 1,
      minRegionHeight: 1,
      mergeDistance: 0,
      padding: 0,
      frameOrder: 'row-major',
      regions,
    },
  })

  expect(bundle.mode).toBe('regions')
  expect(bundle.frames).toHaveLength(2)
  expect(bundle.frames[0].source.rect).toEqual(regions[0])
  expect(bundle.frames[1].source.rect).toEqual(regions[1])
  expect(bundle.frames[0].normal?.rect).toEqual(regions[0])
  expect(bundle.frames[1].normal?.rect).toEqual(regions[1])
})
