import { describe, expect, it } from 'vitest'
import { decodeNormalChannel, lightContribution } from '../renderer/CpuSpriteRenderer'
import type { LightSource } from '../domain/types'
import { lightPointToObject, objectRectFromCenter } from '../renderer/lightingGeometry'

describe('lighting geometry', () => {
  it('maps the viewport center to the center of a centered sprite', () => {
    const objectRect = objectRectFromCenter(500, 350, 476, 476, 1000, 700)

    const point = lightPointToObject(0.5, 0.5, objectRect)
    expect(point[0]).toBeCloseTo(0.5, 10)
    expect(point[1]).toBeCloseTo(0.5, 10)
  })

  it('keeps the light aligned after the sprite is panned', () => {
    const objectRect = objectRectFromCenter(700, 350, 400, 400, 1000, 700)

    const point = lightPointToObject(0.7, 0.5, objectRect)
    expect(point[0]).toBeCloseTo(0.5, 10)
    expect(point[1]).toBeCloseTo(0.5, 10)
  })
})
function pointLight(overrides: Partial<LightSource> = {}): LightSource {
  return {
    id: 'light:test',
    name: 'test',
    type: 'point',
    enabled: true,
    color: '#ffffff',
    intensity: 1,
    x: 0.5,
    y: 0.5,
    direction: 0,
    radius: 0.4,
    innerAngle: 30,
    outerAngle: 55,
    falloff: 2,
    ...overrides,
  }
}

it('keeps a centered point light large enough to illuminate the sprite center and right side', () => {
  const objectRect = objectRectFromCenter(500, 350, 500, 500, 1000, 700)

  expect(lightContribution(0.5, 0.5, 0, 0, 1, 1, pointLight(), objectRect).diffuse).toBeGreaterThan(0)
  expect(lightContribution(0.75, 0.5, 0, 0, 1, 1, pointLight(), objectRect).diffuse).toBeGreaterThan(0)
  expect(lightContribution(0.05, 0.5, 0, 0, 1, 1, pointLight(), objectRect).diffuse).toBe(0)
})

it('aims a spot cone from the light position instead of the sprite corner', () => {
  const objectRect = objectRectFromCenter(500, 350, 500, 500, 1000, 700)
  const spot = pointLight({
    type: 'spot',
    direction: 0,
    radius: 1,
    innerAngle: 30,
    outerAngle: 55,
    falloff: 1,
  })

  expect(lightContribution(0.85, 0.5, 0, 0, 1, 1, spot, objectRect).diffuse).toBeGreaterThan(0)
  expect(lightContribution(0.5, 0.1, 0, 0, 1, 1, spot, objectRect).diffuse).toBe(0)
})
it('treats common 127/128 normal channels as neutral', () => {
  expect(decodeNormalChannel(127)).toBe(0)
  expect(decodeNormalChannel(128)).toBe(0)
  expect(decodeNormalChannel(255)).toBeCloseTo(1, 6)
})
it('lights the spot cone apex at the light position', () => {
  const objectRect = objectRectFromCenter(500, 350, 500, 500, 1000, 700)
  const spot = pointLight({
    type: 'spot',
    direction: 0,
    radius: 1,
    innerAngle: 30,
    outerAngle: 55,
    falloff: 1,
  })

  expect(lightContribution(0.5, 0.5, 0, 0, 1, 1, spot, objectRect).diffuse).toBeGreaterThan(0)
})