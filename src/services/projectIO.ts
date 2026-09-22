import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from '../domain/binary'
import {
  parseProjectDocument,
  projectStateFromDocument,
  serializeProjectDocument,
} from '../domain/projectDocument'
import type { AssetBundle, ProjectDocument, RefinementAssetRecord } from '../domain/types'
import { createZip, readZipAsync, type ZipEntry } from '../domain/zip'

export interface PortableProject {
  document: ProjectDocument
  files: File[]
  refinementAssets: RefinementAssetRecord[]
}

interface JsonAsset {
  path: string
  name: string
  type: string
  dataBase64: string
}

interface PortableRefinementAsset {
  id: string
  frameId: string
  layerId: string
  type: string
  width: number
  height: number
  dataBase64: string
}

interface PortableJson {
  format: 'sprite-light-lab-portable'
  version: 1 | 2 | 3
  document: ProjectDocument
  assets: JsonAsset[]
  refinementAssets?: PortableRefinementAsset[]
}

async function fileToBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

function fileType(file: File, name: string): string {
  if (file.type) {
    return file.type
  }
  return name.toLowerCase().endsWith('.json') ? 'application/json' : 'image/png'
}

function collectBundleFiles(bundle: AssetBundle): Array<{ path: string; file: File }> {
  return [
    ...bundle.images.map((image) => ({ path: image.path, file: image.file })),
    ...(bundle.metadataFiles ?? []).map((metadata) => ({
      path: metadata.name,
      file: metadata.file,
    })),
  ]
}

export function exportReferenceProject(document: ProjectDocument): string {
  return serializeProjectDocument(document)
}

export async function exportPortableJson(
  document: ProjectDocument,
  bundle: AssetBundle,
  refinementAssets: RefinementAssetRecord[] = [],
): Promise<string> {
  const assets: JsonAsset[] = []
  for (const { path, file } of collectBundleFiles(bundle)) {
    assets.push({
      path,
      name: file.name,
      type: fileType(file, path),
      dataBase64: bytesToBase64(await fileToBytes(file)),
    })
  }
  const portableRefinementAssets: PortableRefinementAsset[] = []
  for (const asset of refinementAssets) {
    portableRefinementAssets.push({
      id: asset.id,
      frameId: asset.frameId,
      layerId: asset.layerId,
      type: asset.blob.type || 'image/png',
      width: asset.width,
      height: asset.height,
      dataBase64: bytesToBase64(await fileToBytes(asset.blob as File)),
    })
  }
  const portable: PortableJson = {
    format: 'sprite-light-lab-portable',
    version: 3,
    document,
    assets,
    refinementAssets: portableRefinementAssets,
  }
  return `${JSON.stringify(portable, null, 2)}\n`
}

export async function exportProjectZip(
  document: ProjectDocument,
  bundle: AssetBundle,
  refinementAssets: RefinementAssetRecord[] = [],
): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    {
      name: 'project.json',
      data: textToBytes(serializeProjectDocument(document)),
    },
  ]
  for (const { path, file } of collectBundleFiles(bundle)) {
    entries.push({
      name: `assets/${path.replaceAll('\\', '/')}`,
      data: await fileToBytes(file),
    })
  }
  for (const asset of refinementAssets) {
    entries.push({
      name: `refinements/${asset.id}.png`,
      data: await fileToBytes(asset.blob as File),
    })
  }
  return createZip(entries)
}

export function importPortableJson(content: string): PortableProject {
  const parsed = JSON.parse(content) as Partial<PortableJson>
  if (
    parsed.format !== 'sprite-light-lab-portable' ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
    !parsed.document ||
    !Array.isArray(parsed.assets)
  ) {
    throw new Error('不是受支持的 Sprite Light Lab 自包含 JSON 项目。')
  }

  const files = parsed.assets.map((asset) => {
    const bytes = base64ToBytes(asset.dataBase64)
    return new File([bytes.slice().buffer as ArrayBuffer], asset.name, {
      type: asset.type,
      lastModified: 1,
    })
  })
  const refinementAssets = (parsed.refinementAssets ?? []).map((asset) => {
    const bytes = base64ToBytes(asset.dataBase64)
    return {
      id: asset.id,
      projectId: '',
      frameId: asset.frameId,
      layerId: asset.layerId,
      blob: new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: asset.type || 'image/png',
      }),
      width: asset.width,
      height: asset.height,
      updatedAt: new Date(0).toISOString(),
    } satisfies RefinementAssetRecord
  })
  return {
    document: parseProjectDocument(JSON.stringify(parsed.document)),
    files,
    refinementAssets,
  }
}

export async function importProjectZip(input: ArrayBuffer | Uint8Array): Promise<PortableProject> {
  const entries = await readZipAsync(input)
  const projectEntry = entries.find((entry) => entry.name === 'project.json')
  if (!projectEntry) {
    throw new Error('ZIP 中缺少 project.json。')
  }
  const document = parseProjectDocument(bytesToText(projectEntry.data))
  const files = entries
    .filter((entry) => entry.name.startsWith('assets/') && !entry.name.endsWith('/'))
    .map((entry) => {
      const relativePath = entry.name.slice('assets/'.length)
      const name = relativePath.split('/').at(-1) ?? 'asset.bin'
      const type = name.toLowerCase().endsWith('.json') ? 'application/json' : 'image/png'
      return new File([entry.data.slice().buffer as ArrayBuffer], name, { type, lastModified: 1 })
    })

  const refinementAssets = entries
    .filter((entry) => entry.name.startsWith('refinements/') && entry.name.endsWith('.png'))
    .map((entry) => {
      const fileName = entry.name.split('/').at(-1) ?? 'refinement.png'
      const id = fileName.replace(/\.png$/i, '')
      return {
        id,
        projectId: '',
        frameId: '',
        layerId: '',
        blob: new Blob([entry.data.slice().buffer as ArrayBuffer], { type: 'image/png' }),
        width: 1,
        height: 1,
        updatedAt: new Date(0).toISOString(),
      } satisfies RefinementAssetRecord
    })
  for (const asset of refinementAssets) {
    const refinement = document.version === 3
      ? document.refinements.find((item) => item.cels.some((cel) => cel.bitmapAssetId === asset.id))
      : undefined
    const cel = refinement?.cels.find((item) => item.bitmapAssetId === asset.id)
    if (cel) {
      asset.frameId = cel.frameId
      asset.layerId = cel.layerId
      asset.width = cel.width
      asset.height = cel.height
    }
  }

  return { document, files, refinementAssets }
}

export function projectStateFromPortable(document: ProjectDocument) {
  return projectStateFromDocument(document)
}
