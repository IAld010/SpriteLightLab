import { describe, expect, it } from 'vitest'
import { createDefaultLighting, createDefaultPreferences } from '../domain/defaults'
import { createPalettePreset } from '../domain/palette'
import { createProjectDocument } from '../domain/projectDocument'
import { createFrameRefinement } from '../domain/refinement'
import type { AssetBundle, RefinementAssetRecord } from '../domain/types'
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

function makeRefinementAsset(): RefinementAssetRecord {
  return {
    id: 'refinement-asset:1',
    projectId: 'project:1',
    frameId: 'frame:1',
    layerId: 'layer:1',
    blob: new Blob(['refined-pixel'], { type: 'image/png' }),
    width: 32,
    height: 32,
    updatedAt: new Date(0).toISOString(),
  }
}

describe('portable project IO', () => {
  it('round-trips a self-contained JSON project', async () => {
    const bundle = makeBundle()
    const document = makeDocument(bundle)
    const refinement = createFrameRefinement('frame:1', 32, 32)
    refinement.cels[0].bitmapAssetId = 'refinement-asset:1'
    document.refinements = [refinement]
    const json = await exportPortableJson(document, bundle, [makeRefinementAsset()])
    const restored = importPortableJson(json)

    expect(restored.document.projectName).toBe('Portable')
    expect(restored.files.map((file) => file.name)).toEqual(['hero.png', 'hero.json'])
    expect(restored.refinementAssets).toHaveLength(1)
    expect(restored.refinementAssets[0].id).toBe('refinement-asset:1')
  })

  it('round-trips a ZIP project', async () => {
    const bundle = makeBundle()
    const document = makeDocument(bundle)
    const refinement = createFrameRefinement('frame:1', 32, 32)
    refinement.cels[0].bitmapAssetId = 'refinement-asset:1'
    document.refinements = [refinement]
    const zip = await exportProjectZip(document, bundle, [makeRefinementAsset()])
    const restored = await importProjectZip(zip)

    expect(restored.document.sourceName).toBe('hero.json')
    expect(restored.files).toHaveLength(2)
    expect(restored.refinementAssets).toHaveLength(1)
    expect(restored.refinementAssets[0].frameId).toBe('frame:1')
  })
})