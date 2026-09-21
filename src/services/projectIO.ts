import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from '../domain/binary'
import {
  parseProjectDocument,
  projectStateFromDocument,
  serializeProjectDocument,
} from '../domain/projectDocument'
import type { AssetBundle, ProjectDocument } from '../domain/types'
import { createZip, readZipAsync, type ZipEntry } from '../domain/zip'

export interface PortableProject {
  document: ProjectDocument
  files: File[]
}

interface JsonAsset {
  path: string
  name: string
  type: string
  dataBase64: string
}

interface PortableJson {
  format: 'sprite-light-lab-portable'
  version: 1 | 2
  document: ProjectDocument
  assets: JsonAsset[]
}

async function fileToBytes(file: File): Promise<Uint8Array> {
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
  const portable: PortableJson = {
    format: 'sprite-light-lab-portable',
    version: 2,
    document,
    assets,
  }
  return `${JSON.stringify(portable, null, 2)}\n`
}

export async function exportProjectZip(
  document: ProjectDocument,
  bundle: AssetBundle,
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
  return createZip(entries)
}

export function importPortableJson(content: string): PortableProject {
  const parsed = JSON.parse(content) as Partial<PortableJson>
  if (
    parsed.format !== 'sprite-light-lab-portable' ||
    (parsed.version !== 1 && parsed.version !== 2) ||
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
  return {
    document: parseProjectDocument(JSON.stringify(parsed.document)),
    files,
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

  return { document, files }
}

export function projectStateFromPortable(document: ProjectDocument) {
  return projectStateFromDocument(document)
}
