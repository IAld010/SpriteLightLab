import { describe, expect, it } from 'vitest'
import { createDefaultSpeedCurve } from '../domain/animationTiming'
import { createDefaultLighting, createDefaultPreferences } from '../domain/defaults'
import { createPalettePreset } from '../domain/palette'
import { createFrameRefinement } from '../domain/refinement'
import { createCameraShakeEvent } from '../domain/frameEvents'
import {
  createProjectDocument,
  parseProjectDocument,
  remapProjectEditingState,
  serializeProjectDocument,
} from '../domain/projectDocument'
import type { AssetBundle, ProjectDocumentV1 } from '../domain/types'

function bundle(): AssetBundle {
  const file = new File(['pixel'], 'hero_0001.png', { type: 'image/png' })
  const normalFile = new File(['normal'], 'hero_0001_n.png', { type: 'image/png' })
  return {
    id: 'bundle:1',
    mode: 'frames',
    sourceName: 'hero',
    importedAt: new Date(0).toISOString(),
    images: [
      { id: 'hero', name: file.name, path: file.name, file, width: 32, height: 32 },
      { id: 'normal', name: normalFile.name, path: normalFile.name, file: normalFile, width: 32, height: 32 },
    ],
    frames: [
      {
        id: 'frame:1',
        name: 'hero_0001',
        source: { id: 'source:1', name: file.name, imageId: 'hero' },
        normal: { id: 'normal:1', name: normalFile.name, imageId: 'normal' },
        pairingStatus: 'matched',
      },
    ],
    animations: [{ id: 'clip:1', name: 'hero', frameIds: ['frame:1'], fps: 8, loop: true }],
    normalCandidates: [{ id: 'normal:1', name: normalFile.name, imageId: 'normal' }],
    paletteMode: 'indexed',
    paletteSources: ['#ff0000'],
    warnings: [],
  }
}

describe('project document', () => {
  it('round-trips the upgraded version 3 project configuration', () => {
    const document = createProjectDocument(
      bundle(),
      {
        projectName: '测试角色',
        palettePresets: [createPalettePreset('p:1', '默认', ['#ff0000'])],
        activePaletteId: 'p:1',
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
      },
      {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    )

    document.lighting.lights[0].direction = 315
  document.lighting.lights[1].handleVisible = false
    document.frames[0].alignment = { pivotX: 32, pivotY: 64, offsetX: 0, offsetY: 0 }
    document.animations[0].alignment = {
      canvasWidth: 64,
      canvasHeight: 128,
      anchorX: 32,
      anchorY: 128,
      scale: 1,
    }
    document.animations[0].timing = { speedCurve: createDefaultSpeedCurve() }
    document.animations[0].timing.speedCurve.keyframes[0].value = 0.5
    document.refinements = [createFrameRefinement('frame:1', 32, 32, 'source-hash')]
    const restored = parseProjectDocument(serializeProjectDocument(document))
    expect(restored.version).toBe(3)
    expect(restored.projectName).toBe('测试角色')
    expect(restored.normalPairing[0].normalId).toBe('normal:1')
    expect(restored.lighting.lights[0].direction).toBe(315)
    expect(restored.lighting.lights[1].handleVisible).toBe(false)
    expect(restored.frames[0].alignment?.pivotX).toBe(32)
    expect(restored.animations[0].alignment?.canvasHeight).toBe(128)
    expect(restored.animations[0].timing?.speedCurve.keyframes[0].value).toBe(0.5)
    expect(restored.refinements[0].sourceHash).toBe('source-hash')
  })

  it('remaps refinement and frame event ids when source files are imported again', () => {
    const originalBundle = bundle()
    const document = createProjectDocument(
      originalBundle,
      {
        projectName: '????',
        palettePresets: [createPalettePreset('p:1', '??', ['#ff0000'])],
        activePaletteId: 'p:1',
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
      },
      {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    )
    const reimportedBundle = {
      ...originalBundle,
      frames: originalBundle.frames.map((frame) => ({ ...frame, id: 'frame:new' })),
      animations: originalBundle.animations.map((animation) => ({ ...animation, id: 'clip:new', frameIds: ['frame:new'] })),
    }
    const refinement = createFrameRefinement('frame:1', 32, 32)
    refinement.cels[0].bitmapAssetId = 'asset:1'
    const remapped = remapProjectEditingState(document, reimportedBundle, {
      refinements: [refinement],
      refinementAssets: [{
        id: 'asset:1',
        projectId: 'project:1',
        frameId: 'frame:1',
        layerId: refinement.layers[0].id,
        blob: new Blob(['pixel']),
        width: 32,
        height: 32,
        updatedAt: new Date(0).toISOString(),
      }],
      frameEvents: [createCameraShakeEvent('clip:1', 'frame:1')],
    })

    expect(remapped.refinements[0].sourceFrameId).toBe('frame:new')
    expect(remapped.refinements[0].cels[0].frameId).toBe('frame:new')
    expect(remapped.refinementAssets[0].frameId).toBe('frame:new')
    expect(remapped.frameEvents[0].actionId).toBe('clip:new')
    expect(remapped.frameEvents[0].frameId).toBe('frame:new')
  })

  it('upgrades version 1 documents without losing settings', () => {
    const current = createProjectDocument(
      bundle(),
      {
        projectName: '旧项目',
        palettePresets: [createPalettePreset('p:1', '默认', ['#ff0000'])],
        activePaletteId: 'p:1',
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
      },
      {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    )
    const legacy = { ...current, version: 1 } as ProjectDocumentV1
    const restored = parseProjectDocument(JSON.stringify(legacy))

    expect(restored.version).toBe(3)
    expect(restored.projectName).toBe('旧项目')
    expect(restored.settings.panX).toBe(0)
    expect(restored.gridConfig).toBeUndefined()
  })

  it('persists grid import configuration in version 3 documents', () => {
    const gridConfig = {
      frameWidth: 32,
      frameHeight: 48,
      columns: 4,
      rows: 4,
      offsetX: 2,
      offsetY: 3,
      spacingX: 1,
      spacingY: 1,
      frameOrder: 'column-major' as const,
    }
    const document = createProjectDocument(
      { ...bundle(), gridConfig },
      {
        projectName: '网格项目',
        palettePresets: [createPalettePreset('p:1', '默认', ['#ff0000'])],
        activePaletteId: 'p:1',
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
      },
      {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    )

    const restored = parseProjectDocument(serializeProjectDocument(document))
    expect(restored.gridConfig).toEqual(gridConfig)
  })})
