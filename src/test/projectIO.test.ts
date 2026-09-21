import { describe, expect, it } from 'vitest'
import { createDefaultLighting, createDefaultPreferences } from '../domain/defaults'
import { createPalettePreset } from '../domain/palette'
import { createProjectDocument } from '../domain/projectDocument'
import type { AssetBundle } from '../domain/types'
import {
  exportPortableJson,
  exportProjectZip,
  importPortableJson,
  importProjectZip,
} from '../services/projectIO'

function makeBundle(): AssetBundle {
  const image = new File(['png-bytes'], 'hero.png', { type: 'image/png', lastModified: 1 })
  const metadata = new File(['{}'], 'hero.json', { type: 'application/json', lastModified: 1 })
  return {
    id: 'bundle:portable',
    mode: 'atlas',
    sourceName: 'hero.json',
    importedAt: new Date(0).toISOString(),
    images: [{ id: 'image', name: image.name, path: image.name, file: image, width: 32, height: 32 }],
    frames: [],
    animations: [],
    normalCandidates: [],
    paletteMode: 'indexed',
    paletteSources: ['#ff0000'],
    metadataFiles: [{ name: metadata.name, file: metadata }],
    warnings: [],
  }
}

function makeDocument(bundle: AssetBundle) {
  return createProjectDocument(
    bundle,
    {
      projectName: 'Portable',
      palettePresets: [createPalettePreset('palette', 'Default', ['#ff0000'])],
      activePaletteId: 'palette',
      lighting: createDefaultLighting(),
      renderPreferences: createDefaultPreferences(),
    },
    { backend: 'webgl', textureMode: 'color', background: 'checker', zoom: 1,
        panX: 0,
        panY: 0 },
  )
}

describe('portable project IO', () => {
  it('round-trips a self-contained JSON project', async () => {
    const bundle = makeBundle()
    const json = await exportPortableJson(makeDocument(bundle), bundle)
    const restored = importPortableJson(json)

    expect(restored.document.projectName).toBe('Portable')
    expect(restored.files.map((file) => file.name)).toEqual(['hero.png', 'hero.json'])
  })

  it('round-trips a ZIP project', async () => {
    const bundle = makeBundle()
    const zip = await exportProjectZip(makeDocument(bundle), bundle)
    const restored = await importProjectZip(zip)

    expect(restored.document.sourceName).toBe('hero.json')
    expect(restored.files).toHaveLength(2)
  })
})