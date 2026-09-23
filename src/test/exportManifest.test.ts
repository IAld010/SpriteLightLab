import { describe, expect, it } from 'vitest'
import {
  atlasFileName,
  buildAtlasDocument,
  buildAsepriteAtlas,
  buildEngineManifest,
  buildGenericAtlas,
  buildTexturePackerAtlas,
  frameFileName,
  type AtlasExportInput,
  type AtlasFrameRecord,
} from '../domain/exportManifest'

function frame(overrides: Partial<AtlasFrameRecord> = {}): AtlasFrameRecord {
  return {
    animation: 'idle',
    name: 'idle_0001',
    durationMs: 125,
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    pivotX: 32,
    pivotY: 64,
    offsetX: 0,
    offsetY: 0,
    canvasWidth: 64,
    canvasHeight: 128,
    anchorX: 32,
    anchorY: 128,
    events: [],
    ...overrides,
  }
}

function input(overrides: Partial<AtlasExportInput> = {}): AtlasExportInput {
  return {
    projectName: '骑士',
    imageFileName: '骑士-sheet.png',
    sheetWidth: 256,
    sheetHeight: 128,
    contentMode: 'composited',
    bakedPalette: true,
    bakedLighting: false,
    frames: [frame(), frame({ name: 'idle_0002', x: 128 }), frame({ animation: 'attack', name: 'attack_0001', x: 192 })],
    ...overrides,
  }
}

describe('atlas export documents', () => {
  it('records sheet size, content mode and bake flags in the generic atlas', () => {
    const atlas = buildGenericAtlas(input()) as {
      format: string
      image: string
      size: { width: number; height: number }
      content: string
      baked: { palette: boolean; lighting: boolean }
      frames: Array<{ name: string; events: string[] }>
    }

    expect(atlas.format).toBe('sprite-light-lab-atlas')
    expect(atlas.image).toBe('骑士-sheet.png')
    expect(atlas.size).toEqual({ width: 256, height: 128 })
    expect(atlas.content).toBe('composited')
    expect(atlas.baked).toEqual({ palette: true, lighting: false })
    expect(atlas.frames).toHaveLength(3)
  })

  it('emits Aseprite frames and one frame tag per animation', () => {
    const atlas = buildAsepriteAtlas(input()) as {
      frames: Record<string, { frame: Record<string, number>; duration: number }>
      meta: { size: { w: number; h: number }; image: string; frameTags: Array<{ name: string; from: number; to: number }> }
    }

    expect(Object.keys(atlas.frames)).toEqual(['idle/idle_0001', 'idle/idle_0002', 'attack/attack_0001'])
    expect(atlas.frames['idle/idle_0001'].frame).toEqual({ x: 0, y: 0, w: 64, h: 64 })
    expect(atlas.frames['idle/idle_0001'].duration).toBe(125)
    expect(atlas.meta.size).toEqual({ w: 256, h: 128 })
    expect(atlas.meta.frameTags).toEqual([
      { name: 'idle', from: 0, to: 1, direction: 'forward' },
      { name: 'attack', from: 2, to: 2, direction: 'forward' },
    ])
  })

  it('normalizes pivots for the TexturePacker document', () => {
    const atlas = buildTexturePackerAtlas(input()) as {
      frames: Record<string, { pivot: { x: number; y: number }; sourceSize: { w: number; h: number } }>
      meta: { size: { w: number; h: number } }
    }

    expect(atlas.frames['idle/idle_0001'].pivot).toEqual({ x: 0.5, y: 1 })
    expect(atlas.frames['idle/idle_0001'].sourceSize).toEqual({ w: 64, h: 128 })
    expect(atlas.meta.size).toEqual({ w: 256, h: 128 })
  })

  it('groups animations with duration totals in the engine manifest', () => {
    const manifest = buildEngineManifest(
      input({
        contentMode: 'refinement',
        frames: [
          frame({ events: ['camera-shake'] }),
          frame({ name: 'idle_0002', x: 128, durationMs: 250 }),
          frame({ animation: 'attack', name: 'attack_0001', x: 192, durationMs: 80 }),
        ],
      }),
    )

    expect(manifest.content).toBe('refinement')
    expect(manifest.animations.map((animation) => animation.name)).toEqual(['idle', 'attack'])
    expect(manifest.animations[0].frameCount).toBe(2)
    expect(manifest.animations[0].durationMs).toBe(375)
    expect(manifest.animations[0].frames[0].events).toEqual(['camera-shake'])
    expect(manifest.animations[0].frames[0].pivot).toEqual({ x: 32, y: 64 })
    expect(manifest.animations[0].frames[0].canvas).toEqual({
      width: 64,
      height: 128,
      anchorX: 32,
      anchorY: 128,
    })
  })

  it('routes each atlas format to its serializer', () => {
    expect(buildAtlasDocument('generic', input())).toHaveProperty('format', 'sprite-light-lab-atlas')
    expect(buildAtlasDocument('aseprite', input())).toHaveProperty('meta.frameTags')
    expect(buildAtlasDocument('texturepacker', input())).toHaveProperty('meta.app', 'SpriteLightLab')
  })

  it('builds safe file names', () => {
    expect(frameFileName(7, 'idle_0007')).toBe('0007_idle_0007.png')
    expect(frameFileName(1, 'a/b:c')).toBe('0001_a-b-c.png')
    expect(atlasFileName('骑士')).toBe('骑士-sheet.png')
    expect(atlasFileName('骑士', 'attack 1')).toBe('骑士-attack 1.png')
    expect(atlasFileName('   ')).toBe('sprite-sheet.png')
  })
})
