import { describe, expect, it } from 'vitest'
import { computeAlignedSpriteScale } from '../renderer/previewScale'

describe('preview scale', () => {
  it('does not apply the output texture scale twice', () => {
    const outputScale = 1024 / 2048
    const spriteScale = computeAlignedSpriteScale(0.3, outputScale)

    expect(spriteScale).toBeCloseTo(0.6, 10)
    expect(1024 * spriteScale).toBeCloseTo(2048 * 0.3, 10)
  })

  it('uses the normal action scale when no texture downsampling happened', () => {
    expect(computeAlignedSpriteScale(0.42, 1)).toBeCloseTo(0.42, 10)
  })
})