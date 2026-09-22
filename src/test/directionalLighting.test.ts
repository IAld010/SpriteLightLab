import { describe, expect, it } from 'vitest'
import { decodeNormalChannel, lightContribution } from '../renderer/CpuSpriteRenderer'
import type { LightSource } from '../domain/types'

const directional: LightSource = {
  id: 'light:directional',
  name: 'directional',
  type: 'directional',
  enabled: true,
  color: '#ffffff',
  intensity: 1,
  direction: 225,
}

describe('directional lighting', () => {
  it('treats common 127/128 normal channels as neutral', () => {
    expect(decodeNormalChannel(127)).toBe(0)
    expect(decodeNormalChannel(128)).toBe(0)
    expect(decodeNormalChannel(255)).toBeCloseTo(1, 6)
  })

  it('lights a surface facing toward the directional light', () => {
    const sample = lightContribution(0, 0, 1, directional)

    expect(sample.diffuse).toBeGreaterThan(0)
    expect(sample.specular).toBeGreaterThan(0)
  })

  it('does not light a surface facing away from the directional light', () => {
    const sample = lightContribution(0, 0, -1, directional)

    expect(sample.diffuse).toBe(0)
    expect(sample.specular).toBe(0)
  })
})