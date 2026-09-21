import { openDB, type DBSchema } from 'idb'
import type { AssetBundle, ProjectDocumentV1 } from '../domain/types'

interface WorkspaceDatabase extends DBSchema {
  workspace: {
    key: string
    value: {
      id: 'last'
      document: ProjectDocumentV1
      files: File[]
      savedAt: string
    }
  }
  directory: {
    key: string
    value: {
      id: 'last'
      handle: FileSystemDirectoryHandle
      savedAt: string
    }
  }
}

const database = openDB<WorkspaceDatabase>('sprite-light-lab', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('workspace')) {
      db.createObjectStore('workspace', { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains('directory')) {
      db.createObjectStore('directory', { keyPath: 'id' })
    }
  },
})

export async function saveWorkspace(
  document: ProjectDocumentV1,
  bundle: AssetBundle,
): Promise<void> {
  const db = await database
  const files = [
    ...bundle.images.map((image) => image.file),
    ...(bundle.metadataFiles ?? []).map((metadata) => metadata.file),
  ]
  await db.put('workspace', {
    id: 'last',
    document,
    files,
    savedAt: new Date().toISOString(),
  })
}

export async function loadWorkspace(): Promise<
  | {
      document: ProjectDocumentV1
      files: File[]
      savedAt: string
    }
  | undefined
> {
  const db = await database
  return db.get('workspace', 'last')
}

export async function clearWorkspace(): Promise<void> {
  const db = await database
  await db.delete('workspace', 'last')
}
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await database
  await db.put('directory', { id: 'last', handle, savedAt: new Date().toISOString() })
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await database
  const value = await db.get('directory', 'last')
  return value?.handle
}
