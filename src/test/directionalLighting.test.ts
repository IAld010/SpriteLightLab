import { describe, expect, it } from 'vitest'
import { decodeNormalChannel, lightContribution } from '../renderer/CpuSpriteRenderer'
import type { LightSource } from '../domain/types'
import type { ObjectRect } from '../renderer/lightingGeometry'

const fullBoard: ObjectRect = [0, 0, 1, 1]

function light(type: LightSource['type'], overrides: Partial<LightSource> = {}): LightSource {
  return {
    id: `light:${type}`,
    name: type,
    type,
    enabled: true,
    color: '#ffffff',
    intensity: 1,
    x: 0.5,
    y: 0.5,
    direction: 0,
    radius: 1,
    falloff: 20,
    coneAngle: 60,
    softness: 0,
    ...overrides,
  }
}

describe('normal-map lighting', () => {
  it('treats common 127/128 normal channels as neutral', () => {
    expect(decodeNormalChannel(127)).toBe(0)
    expect(decodeNormalChannel(128)).toBe(0)
    expect(decodeNormalChannel(255)).toBeCloseTo(1, 6)
  })

  it('lights a surface facing toward the directional light', () => {
    const directional = light('directional', { direction: 225 })
    const sample = lightContribution(0.5, 0.5, 0, 0, 1, 1, directional, fullBoard)

    expect(sample.diffuse).toBeGreaterThan(0)
    expect(sample.specular).toBeGreaterThan(0)
  })

  it('does not light a surface facing away from the directional light', () => {
    const directional = light('directional', { direction: 225 })
    const sample = lightContribution(0.5, 0.5, 0, 0, -1, 1, directional, fullBoard)

    expect(sample.diffuse).toBe(0)
    expect(sample.specular).toBe(0)
  })

  it('peaks a point light at the exact checkerboard handle coordinate', () => {
    const point = light('point', { x: 0.5, y: 0.5, radius: 0.8 })
    const atHandle = lightContribution(0.5, 0.5, 0, 0, 1, 1, point, fullBoard)
    const offset = lightContribution(0.65, 0.5, 0, 0, 1, 1, point, fullBoard)

    expect(atHandle.diffuse).toBeGreaterThan(offset.diffuse)
    expect(offset.diffuse).toBeGreaterThan(0)
  })

  it('emits a spotlight cone from the handle coordinate', () => {
    const spot = light('spot', { x: 0.5, y: 0.5, direction: 0, coneAngle: 60 })
    const inside = lightContribution(0.75, 0.5, 0, 0, 1, 1, spot, fullBoard)
    const outside = lightContribution(0.25, 0.5, 0, 0, 1, 1, spot, fullBoard)

    expect(inside.diffuse).toBeGreaterThan(0)
    expect(outside.diffuse).toBe(0)
  })
})