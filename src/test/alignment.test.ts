import { describe, expect, it } from 'vitest'
import {
  computeActionAlignment,
  frameCanvasPlacement,
  resolveFrameAlignment,
} from '../domain/alignment'

describe('action alignment', () => {
  it('aligns 64x64 and 64x128 frames by bottom center without changing scale', () => {
    const idle = { id: 'idle', width: 64, height: 64, alignment: resolveFrameAlignment(64, 64, 'bottom-center') }
    const attack = { id: 'attack', width: 64, height: 128, alignment: resolveFrameAlignment(64, 128, 'bottom-center') }
    const layout = computeActionAlignment([idle, attack])

    expect(layout).toEqual({
      canvasWidth: 64,
      canvasHeight: 128,
      anchorX: 32,
      anchorY: 128,
      scale: 1,
    })
    expect(frameCanvasPlacement(idle, layout)).toEqual({ x: 0, y: 64, width: 64, height: 64 })
    expect(frameCanvasPlacement(attack, layout)).toEqual({ x: 0, y: 0, width: 64, height: 128 })
  })

  it('includes a 128x128 frame in the same action canvas without frame fitting', () => {
    const idle = { id: 'idle', width: 64, height: 64, alignment: resolveFrameAlignment(64, 64, 'bottom-center') }
    const attack = { id: 'attack', width: 64, height: 128, alignment: resolveFrameAlignment(64, 128, 'bottom-center') }
    const wideAttack = { id: 'wide', width: 128, height: 128, alignment: resolveFrameAlignment(128, 128, 'bottom-center') }
    const layout = computeActionAlignment([idle, attack, wideAttack])

    expect(layout).toEqual({
      canvasWidth: 128,
      canvasHeight: 128,
      anchorX: 64,
      anchorY: 128,
      scale: 1,
    })
    expect(frameCanvasPlacement(idle, layout)).toEqual({ x: 32, y: 64, width: 64, height: 64 })
    expect(frameCanvasPlacement(attack, layout)).toEqual({ x: 32, y: 0, width: 64, height: 128 })
    expect(frameCanvasPlacement(wideAttack, layout)).toEqual({ x: 0, y: 0, width: 128, height: 128 })
  })

  it('uses frame offsets after pivot alignment', () => {
    const idle = { id: 'idle', width: 64, height: 64, alignment: resolveFrameAlignment(64, 64, 'bottom-center') }
    idle.alignment.offsetX = 4
    idle.alignment.offsetY = -2
    const layout = computeActionAlignment([idle])

    expect(layout.canvasWidth).toBe(64)
    expect(layout.canvasHeight).toBe(66)
    expect(layout.anchorX).toBe(28)
    expect(layout.anchorY).toBe(66)
    expect(frameCanvasPlacement(idle, layout)).toEqual({ x: 0, y: 0, width: 64, height: 64 })
  })

  it('supports centered and manual pixel anchors', () => {
    expect(resolveFrameAlignment(65, 33, 'center')).toEqual({
      pivotX: 32.5,
      pivotY: 16.5,
      offsetX: 0,
      offsetY: 0,
    })
    expect(resolveFrameAlignment(65, 33, 'bottom-center')).toEqual({
      pivotX: 32.5,
      pivotY: 33,
      offsetX: 0,
      offsetY: 0,
    })
  })
})
