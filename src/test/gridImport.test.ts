import { describe, expect, it } from 'vitest'
import { createGridBundle, createGridRects, validateGridConfig } from '../domain/gridImport'
import type { RuntimeImage } from '../domain/types'

describe('grid import', () => {
  it('creates row-major rectangles for a 4x4 color sheet', () => {
    const rects = createGridRects({
      frameWidth: 32,
      frameHeight: 48,
      columns: 4,
      rows: 4,
      offsetX: 0,
      offsetY: 0,
      spacingX: 0,
      spacingY: 0,
      frameOrder: 'row-major',
    })

    expect(rects).toHaveLength(16)
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 32, height: 48 })
    expect(rects[2]).toEqual({ x: 64, y: 0, width: 32, height: 48 })
    expect(rects[15]).toEqual({ x: 96, y: 144, width: 32, height: 48 })
  })
})

  it('supports margins, spacing and column-major order', () => {
    const rects = createGridRects({
      frameWidth: 16,
      frameHeight: 20,
      columns: 2,
      rows: 2,
      offsetX: 5,
      offsetY: 7,
      spacingX: 3,
      spacingY: 4,
      frameOrder: 'column-major',
    })

    expect(rects).toEqual([
      { x: 5, y: 7, width: 16, height: 20 },
      { x: 5, y: 31, width: 16, height: 20 },
      { x: 24, y: 7, width: 16, height: 20 },
      { x: 24, y: 31, width: 16, height: 20 },
    ])
  })
  it('rejects a grid that extends beyond the sprite sheet', () => {
    const warnings = validateGridConfig(
      {
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 4,
        offsetX: 0,
        offsetY: 0,
        spacingX: 0,
        spacingY: 0,
        frameOrder: 'row-major',
      },
      { width: 100, height: 128 },
    )

    expect(warnings.some((warning) => warning.code === 'grid-out-of-bounds')).toBe(true)
    expect(warnings.find((warning) => warning.code === 'grid-out-of-bounds')?.severity).toBe('error')
  })

  it('requires color and normal sheets to have identical pixel dimensions', () => {
    const warnings = validateGridConfig(
      {
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 4,
        offsetX: 0,
        offsetY: 0,
        spacingX: 0,
        spacingY: 0,
        frameOrder: 'row-major',
      },
      { width: 128, height: 128 },
      { width: 256, height: 128 },
    )

    const mismatch = warnings.find((warning) => warning.code === 'grid-size-mismatch')
    expect(mismatch?.severity).toBe('error')
    expect(mismatch?.message).toContain('128×128')
    expect(mismatch?.message).toContain('256×128')
  })
  it('creates aligned color and normal frames from one grid configuration', () => {
    const colorFile = new File(['color'], 'hero_diffuse.png', { type: 'image/png' })
    const normalFile = new File(['normal'], 'hero_normal.png', { type: 'image/png' })
    const colorImage: RuntimeImage = {
      id: 'color',
      name: colorFile.name,
      path: colorFile.name,
      file: colorFile,
      width: 64,
      height: 96,
    }
    const normalImage: RuntimeImage = {
      id: 'normal',
      name: normalFile.name,
      path: normalFile.name,
      file: normalFile,
      width: 64,
      height: 96,
    }

    const bundle = createGridBundle({
      colorImage,
      normalImage,
      config: {
        frameWidth: 32,
        frameHeight: 48,
        columns: 2,
        rows: 2,
        offsetX: 0,
        offsetY: 0,
        spacingX: 0,
        spacingY: 0,
        frameOrder: 'row-major',
      },
    })

    expect(bundle.mode).toBe('grid')
    expect(bundle.frames).toHaveLength(4)
    expect(bundle.animations[0].name).toBe('hero')
    expect(bundle.animations[0].frameIds).toHaveLength(4)
    expect(bundle.frames[0].source.rect).toEqual({ x: 0, y: 0, width: 32, height: 48 })
    expect(bundle.frames[3].source.rect).toEqual({ x: 32, y: 48, width: 32, height: 48 })
    expect(bundle.frames[3].normal?.rect).toEqual(bundle.frames[3].source.rect)
    expect(bundle.frames.every((frame) => frame.pairingStatus === 'matched')).toBe(true)
  })