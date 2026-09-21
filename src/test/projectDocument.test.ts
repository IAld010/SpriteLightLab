import { describe, expect, it } from 'vitest'
import { createDefaultLighting, createDefaultPreferences } from '../domain/defaults'
import { createPalettePreset } from '../domain/palette'
import { createProjectDocument, parseProjectDocument, serializeProjectDocument } from '../domain/projectDocument'
import type { AssetBundle } from '../domain/types'

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
  it('round-trips version 1 project configuration', () => {
    const document = createProjectDocument(
      bundle(),
      {
        projectName: '测试角色',
        palettePresets: [createPalettePreset('p:1', '默认', ['#ff0000'])],
        activePaletteId: 'p:1',
        lighting: createDefaultLighting(),
        renderPreferences: createDefaultPreferences(),
      },
      { backend: 'webgl', textureMode: 'color', background: 'checker', zoom: 1,
        panX: 0,
        panY: 0 },
    )

    const restored = parseProjectDocument(serializeProjectDocument(document))
    expect(restored.version).toBe(1)
    expect(restored.projectName).toBe('测试角色')
    expect(restored.normalPairing[0].normalId).toBe('normal:1')
  })
})