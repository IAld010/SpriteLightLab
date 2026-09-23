import { describe, expect, it } from 'vitest'
import { collectExportPlan } from '../services/projectExport'
import type { AssetBundle, PreviewFrame, Rect, RuntimeImage } from '../domain/types'

function image(id: string, width: number, height: number): RuntimeImage {
  const file = new File(['pixel'], `${id}.png`, { type: 'image/png' })
  return { id, name: file.name, path: file.name, file, width, height }
}

function frame(id: string, name: string, imageId: string, rect?: Rect): PreviewFrame {
  return {
    id,
    name,
    source: { id: `source:${id}`, name: `${name}.png`, imageId, ...(rect ? { rect } : {}) },
    pairingStatus: 'missing',
  }
}

function bundle(): AssetBundle {
  return {
    id: 'bundle:1',
    mode: 'frames',
    sourceName: 'hero',
    importedAt: new Date(0).toISOString(),
    images: [image('img:idle', 64, 64), image('img:attack', 64, 128)],
    frames: [
      frame('frame:idle1', 'idle_0001', 'img:idle'),
      frame('frame:idle2', 'idle_0002', 'img:idle'),
      frame('frame:attack1', 'attack_0001', 'img:attack'),
    ],
    animations: [
      { id: 'clip:idle', name: 'idle', frameIds: ['frame:idle1', 'frame:idle2'], fps: 8, loop: true },
      { id: 'clip:attack', name: 'attack', frameIds: ['frame:attack1'], fps: 10, loop: false },
    ],
    normalCandidates: [],
    paletteMode: 'fullcolor',
    paletteSources: [],
    warnings: [],
  }
}

function plan(overrides: Partial<Parameters<typeof collectExportPlan>[0]> = {}) {
  return collectExportPlan({
    bundle: bundle(),
    projectName: '骑士',
    scope: 'action',
    content: 'composited',
    bakePalette: true,
    bakeLighting: false,
    layout: 'frame',
    selectedActionId: 'clip:idle',
    currentFrameId: 'frame:idle2',
    ...overrides,
  })
}

describe('export planning', () => {
  it('exports a single frame for the frame scope', () => {
    const result = plan({ scope: 'frame' })

    expect(result.frames).toHaveLength(1)
    expect(result.frames[0].frame.id).toBe('frame:idle2')
    expect(result.frames[0].actionName).toBe('idle')
    expect(result.frames[0].durationMs).toBe(125)
    expect(result.content).toBe('composited')
  })

  it('exports every frame of the selected action with schedule durations', () => {
    const result = plan()

    expect(result.frames.map((entry) => entry.frameName)).toEqual(['idle_0001', 'idle_0002'])
    expect(result.frames.map((entry) => entry.indexInAction)).toEqual([0, 1])
    expect(result.frames.map((entry) => entry.index)).toEqual([0, 1])
    expect(result.frames.every((entry) => entry.durationMs === 125)).toBe(true)
  })

  it('concatenates all actions for the project scope', () => {
    const result = plan({ scope: 'project' })

    expect(result.frames.map((entry) => `${entry.actionName}/${entry.frameName}`)).toEqual([
      'idle/idle_0001',
      'idle/idle_0002',
      'attack/attack_0001',
    ])
    expect(result.frames.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(result.frames[2].durationMs).toBe(100)
  })

  it('derives action alignment from frames when the clip has none', () => {
    const result = plan({ scope: 'project' })
    const idle = result.frames[0]
    const attack = result.frames[2]

    expect(idle.actionAlignment).toEqual({
      canvasWidth: 64,
      canvasHeight: 64,
      anchorX: 32,
      anchorY: 64,
      scale: 1,
    })
    expect(attack.actionAlignment).toEqual({
      canvasWidth: 64,
      canvasHeight: 128,
      anchorX: 32,
      anchorY: 128,
      scale: 1,
    })
  })

  it('falls back to bottom-center pivots and carries the layout switch', () => {
    const result = plan({ layout: 'canvas' })

    expect(result.layout).toBe('canvas')
    expect(result.frames.map((entry) => [entry.frameAlignment.pivotX, entry.frameAlignment.pivotY])).toEqual([
      [32, 64],
      [32, 64],
    ])
  })
})
