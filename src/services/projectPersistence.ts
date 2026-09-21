import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { upgradeProjectDocument } from '../domain/projectDocument'
import type {
  AssetBundle,
  ImportMode,
  ProjectDocument,
  ProjectDocumentV1,
  ProjectDocumentV2,
} from '../domain/types'

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceName: string
  sourceMode: ImportMode
  frameCount: number
  animationCount: number
  warningCount: number
}

export interface StoredProject {
  id: string
  createdAt: string
  updatedAt: string
  document: ProjectDocumentV2
  files: File[]
}

interface LegacyWorkspace {
  id: 'last'
  document: ProjectDocumentV1
  files: File[]
  savedAt: string
}

interface ProjectDatabase extends DBSchema {
  projectIndex: {
    key: string
    value: ProjectSummary
  }
  projectData: {
    key: string
    value: StoredProject
  }
  meta: {
    key: string
    value: { id: 'active'; projectId?: string; savedAt: string }
  }
  workspace: {
    key: string
    value: LegacyWorkspace
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

let databasePromise: Promise<IDBPDatabase<ProjectDatabase>> | undefined

function getDatabase(): Promise<IDBPDatabase<ProjectDatabase>> {
  databasePromise ??= openDB<ProjectDatabase>('sprite-light-lab', 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('workspace')) {
        db.createObjectStore('workspace', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('directory')) {
        db.createObjectStore('directory', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('projectIndex')) {
        db.createObjectStore('projectIndex', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('projectData')) {
        db.createObjectStore('projectData', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'id' })
      }
    },
  })
  return databasePromise
}

let migrationPromise: Promise<void> | undefined

function makeId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `project:${random}`
}

export function createProjectId(): string {
  return makeId()
}

function safeProjectName(name: string | undefined): string {
  return name?.trim() || '未命名精灵项目'
}

function summaryFromProject(
  project: Omit<StoredProject, 'files'>,
): ProjectSummary {
  return {
    id: project.id,
    name: safeProjectName(project.document.projectName),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    sourceName: project.document.sourceName,
    sourceMode: project.document.sourceMode,
    frameCount: project.document.frames.length,
    animationCount: project.document.animations.length,
    warningCount: project.document.frames.filter((frame) => !frame.normal).length,
  }
}

function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

async function migrateLegacyWorkspace(
  db: IDBPDatabase<ProjectDatabase>,
): Promise<void> {
  const projectCount = await db.count('projectIndex')
  if (projectCount > 0) {
    await db.delete('workspace', 'last')
    return
  }

  const legacy = await db.get('workspace', 'last')
  if (!legacy) {
    return
  }

  const document = upgradeProjectDocument(legacy.document)
  const id = createProjectId()
  const createdAt = document.createdAt || legacy.savedAt || new Date().toISOString()
  const updatedAt = legacy.savedAt || createdAt
  const stored: StoredProject = {
    id,
    createdAt,
    updatedAt,
    document,
    files: legacy.files,
  }
  const transaction = db.transaction(
    ['projectIndex', 'projectData', 'meta', 'workspace'],
    'readwrite',
  )
  await transaction.objectStore('projectIndex').put(summaryFromProject(stored))
  await transaction.objectStore('projectData').put(stored)
  await transaction.objectStore('meta').put({
    id: 'active',
    projectId: id,
    savedAt: new Date().toISOString(),
  })
  await transaction.objectStore('workspace').delete('last')
  await transaction.done
}

async function ensureRepositoryReady(): Promise<IDBPDatabase<ProjectDatabase>> {
  const db = await getDatabase()
  migrationPromise ??= migrateLegacyWorkspace(db)
  await migrationPromise
  return db
}

export async function loadProjectLibrary(): Promise<{
  projects: ProjectSummary[]
  activeProjectId?: string
}> {
  const db = await ensureRepositoryReady()
  const [projects, active] = await Promise.all([
    db.getAll('projectIndex'),
    db.get('meta', 'active'),
  ])
  return {
    projects: sortProjects(projects),
    activeProjectId: active?.projectId,
  }
}

export async function saveProject(input: {
  id: string
  createdAt: string
  document: ProjectDocument
  files: File[]
}): Promise<ProjectSummary> {
  const db = await ensureRepositoryReady()
  const document = upgradeProjectDocument(input.document)
  const now = new Date().toISOString()
  const stored: StoredProject = {
    id: input.id,
    createdAt: input.createdAt || document.createdAt || now,
    updatedAt: now,
    document,
    files: input.files,
  }
  const summary = summaryFromProject(stored)
  const transaction = db.transaction(['projectIndex', 'projectData', 'meta'], 'readwrite')
  await transaction.objectStore('projectIndex').put(summary)
  await transaction.objectStore('projectData').put(stored)
  await transaction.objectStore('meta').put({
    id: 'active',
    projectId: input.id,
    savedAt: now,
  })
  await transaction.done
  return summary
}

export async function loadProject(projectId: string): Promise<StoredProject | undefined> {
  const db = await ensureRepositoryReady()
  return db.get('projectData', projectId)
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await ensureRepositoryReady()
  const transaction = db.transaction(['projectIndex', 'projectData', 'meta'], 'readwrite')
  await transaction.objectStore('projectIndex').delete(projectId)
  await transaction.objectStore('projectData').delete(projectId)
  const active = await transaction.objectStore('meta').get('active')
  if (active?.projectId === projectId) {
    await transaction.objectStore('meta').delete('active')
  }
  await transaction.done
}

export async function setActiveProjectId(projectId?: string): Promise<void> {
  const db = await ensureRepositoryReady()
  if (!projectId) {
    await db.delete('meta', 'active')
    return
  }
  await db.put('meta', {
    id: 'active',
    projectId,
    savedAt: new Date().toISOString(),
  })
}

export async function renameProject(
  projectId: string,
  requestedName: string,
): Promise<ProjectSummary | undefined> {
  const db = await ensureRepositoryReady()
  const stored = await db.get('projectData', projectId)
  if (!stored) {
    return undefined
  }
  const name = safeProjectName(requestedName)
  const now = new Date().toISOString()
  const document = upgradeProjectDocument({ ...stored.document, projectName: name })
  const updated: StoredProject = {
    ...stored,
    updatedAt: now,
    document,
  }
  const summary = summaryFromProject(updated)
  const transaction = db.transaction(['projectIndex', 'projectData'], 'readwrite')
  await transaction.objectStore('projectIndex').put(summary)
  await transaction.objectStore('projectData').put(updated)
  await transaction.done
  return summary
}

export function projectFilesFromBundle(bundle: AssetBundle): File[] {
  return [
    ...bundle.images.map((image) => image.file),
    ...(bundle.metadataFiles ?? []).map((metadata) => metadata.file),
  ]
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await ensureRepositoryReady()
  await db.put('directory', { id: 'last', handle, savedAt: new Date().toISOString() })
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await ensureRepositoryReady()
  const value = await db.get('directory', 'last')
  return value?.handle
}

// Legacy workspace API kept for migration tests and older callers.
export async function saveWorkspace(
  document: ProjectDocumentV1,
  bundle: AssetBundle,
): Promise<void> {
  const db = await getDatabase()
  await db.put('workspace', {
    id: 'last',
    document,
    files: projectFilesFromBundle(bundle),
    savedAt: new Date().toISOString(),
  })
}

export async function loadWorkspace(): Promise<LegacyWorkspace | undefined> {
  const db = await getDatabase()
  return db.get('workspace', 'last')
}

export async function clearWorkspace(): Promise<void> {
  const db = await getDatabase()
  await db.delete('workspace', 'last')
}
