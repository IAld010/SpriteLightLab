import { describe, expect, it } from 'vitest'
import { lightPointToObject, objectRectFromSpriteAnchor } from '../renderer/lightingGeometry'

describe('lighting geometry', () => {
  it('uses the actual sprite anchor to derive the rendered object rectangle', () => {
    const objectRect = objectRectFromSpriteAnchor(300, 400, 200, 100, 1000, 800, 0.25, 1)

    expect(objectRect).toEqual([0.25, 0.375, 0.2, 0.125])
  })

  it('maps a checkerboard point at the sprite pivot back to the matching frame coordinate', () => {
    const objectRect = objectRectFromSpriteAnchor(300, 400, 200, 100, 1000, 800, 0.25, 1)
    const [x, y] = lightPointToObject(0.3, 0.5, objectRect)

    expect(x).toBeCloseTo(0.25, 10)
    expect(y).toBeCloseTo(1, 10)
  })
})