import { createProjectDocument } from '../domain/projectDocument'
import type { ProjectDocument } from '../domain/types'
import { useEditorStore } from '../store/editorStore'
import { useFrameEventStore } from '../store/frameEventStore'
import { useProjectStore } from '../store/projectStore'
import { useRefinementStore } from '../store/refinementStore'
import { exportProjectZip } from './projectIO'

/** File-name safe project name, shared by every project download. */
export function currentProjectFileName(): string {
  const name = useProjectStore.getState().projectName.trim().replace(/[\\/:*?"<>|]+/g, '-')
  return name || 'sprite-project'
}

/**
 * Snapshots the live editor stores into a project document.
 * Used by exporters that must not depend on whatever React last rendered.
 */
export function buildCurrentProjectDocument() {
  const editor = useEditorStore.getState()
  if (!editor.bundle) {
    throw new Error('请先导入素材。')
  }
  const project = useProjectStore.getState()
  const refinement = useRefinementStore.getState()
  return createProjectDocument(
    editor.bundle,
    {
      projectName: project.projectName,
      palettePresets: project.palettePresets,
      activePaletteId: project.activePaletteId,
      lighting: project.lighting,
      renderPreferences: project.renderPreferences,
    },
    editor.settings,
    {
      refinements: Object.values(refinement.refinements),
      frameEvents: useFrameEventStore.getState().events,
    },
  )
}

/** Every cel bitmap id the document points at; orphaned bitmaps never belong in a package. */
function referencedBitmapIds(document: ProjectDocument): Set<string> {
  const ids = new Set<string>()
  if (document.version !== 3) return ids
  for (const refinement of document.refinements) {
    for (const cel of refinement.cels) {
      if (cel.bitmapAssetId) ids.add(cel.bitmapAssetId)
    }
  }
  return ids
}

/** Self-contained project package: document, source assets and refinement bitmaps. */
export async function exportCurrentProjectZip(): Promise<Uint8Array> {
  const editor = useEditorStore.getState()
  if (!editor.bundle) {
    throw new Error('请先导入素材。')
  }
  const document = buildCurrentProjectDocument()
  const referenced = referencedBitmapIds(document)
  const refinement = useRefinementStore.getState()
  const assets = Object.values(refinement.assets).filter((asset) => referenced.has(asset.id))
  return exportProjectZip(document, editor.bundle, assets)
}
