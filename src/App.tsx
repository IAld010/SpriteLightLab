import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AnchorCalibrationPage } from './components/AnchorCalibrationPage'
import { GridImportDialog } from './components/GridImportDialog'
import { ImportGuideDialog } from './components/ImportGuide'
import { ManualMatchPage } from './components/ManualMatchPage'
import { InspectorPanel } from './components/InspectorPanel'
import { PreviewStage } from './components/PreviewStage'
import { ProjectLibraryPage } from './components/ProjectLibraryPage'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { importFiles as prepareAssetFiles } from './domain/importAssets'
import { computeFrameSchedule } from './domain/animationTiming'
import { createProjectDocument } from './domain/projectDocument'
import {
  deleteProject,
  loadProject,
  loadProjectLibrary,
  projectFilesFromBundle,
  renameProject,
  saveProject,
} from './services/projectPersistence'
import type { AssetBundle } from './domain/types'
import { getSelectedAction, useEditorStore } from './store/editorStore'
import { useProjectLibraryStore } from './store/projectLibraryStore'
import { isExternalFileDrag } from './utils/dragAndDrop'
import { useProjectStore } from './store/projectStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false)
  const [rendererStatus, setRendererStatus] = useState('未连接')
  const [showLibrary, setShowLibrary] = useState(true)
  const [showGridImport, setShowGridImport] = useState(false)
  const [showImportGuide, setShowImportGuide] = useState(false)
  const [matchingBundle, setMatchingBundle] = useState<AssetBundle>()
  const [isPreparingImport, setIsPreparingImport] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [libraryError, setLibraryError] = useState<string>()
  const hydrated = useRef(false)
  const switchingProject = useRef(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const bundle = useEditorStore((state) => state.bundle)
  const projectId = useEditorStore((state) => state.projectId)
  const projectCreatedAt = useEditorStore((state) => state.projectCreatedAt)
  const isImporting = useEditorStore((state) => state.isImporting)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const anchorCalibrationEnabled = useEditorStore((state) => state.anchorCalibrationEnabled)
  const notice = useEditorStore((state) => state.notice)
  const importProjectFiles = useEditorStore((state) => state.importProjectFiles)
  const clearProject = useEditorStore((state) => state.clearProject)
  const commitImportedBundle = useEditorStore((state) => state.commitImportedBundle)
  const dismissNotice = useEditorStore((state) => state.dismissNotice)
  const advanceFrame = useEditorStore((state) => state.advanceFrame)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const action = useEditorStore((state) => getSelectedAction(state))
  const settings = useEditorStore((state) => state.settings)

  const projects = useProjectLibraryStore((state) => state.projects)
  const activeProjectId = useProjectLibraryStore((state) => state.activeProjectId)
  const upsertProject = useProjectLibraryStore((state) => state.upsertProject)
  const refreshLibrary = useProjectLibraryStore((state) => state.refresh)
  const setStoreError = useProjectLibraryStore((state) => state.setError)
  const setNotice = useEditorStore((state) => state.setNotice)
  const activateProject = useProjectLibraryStore((state) => state.setActiveProjectId)

  const prepareLocalImport = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return
      }
      setIsPreparingImport(true)
      try {
        const imported = await prepareAssetFiles(files)
        setMatchingBundle(imported)
      } catch (error) {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : '素材解析失败。',
        })
      } finally {
        setIsPreparingImport(false)
      }
    },
    [setNotice],
  )
  const persistCurrentProject = useCallback(async (): Promise<void> => {
    const editor = useEditorStore.getState()
    const project = useProjectStore.getState()
    if (!editor.bundle || !editor.projectId) {
      return
    }
    const document = createProjectDocument(
      editor.bundle,
      {
        projectName: project.projectName,
        palettePresets: project.palettePresets,
        activePaletteId: project.activePaletteId,
        lighting: project.lighting,
        renderPreferences: project.renderPreferences,
      },
      editor.settings,
    )
    const summary = await saveProject({
      id: editor.projectId,
      createdAt: editor.projectCreatedAt ?? document.createdAt,
      document,
      files: projectFilesFromBundle(editor.bundle),
    })
    upsertProject(summary, true)
  }, [upsertProject])

  const flushCurrentProject = useCallback(async (): Promise<void> => {
    saveQueue.current = saveQueue.current.catch(() => undefined).then(persistCurrentProject)
    await saveQueue.current
  }, [persistCurrentProject])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const library = await loadProjectLibrary()
        if (cancelled) {
          return
        }
        useProjectLibraryStore.setState({
          projects: library.projects,
          activeProjectId: library.activeProjectId,
          initialized: true,
          isLoading: false,
          error: undefined,
        })
        if (library.activeProjectId) {
          const stored = await loadProject(library.activeProjectId)
          if (!cancelled && stored) {
            await importProjectFiles(stored.files, stored.document, {
              projectId: stored.id,
              createdAt: stored.createdAt,
            })
            if (!cancelled) {
              setShowLibrary(false)
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '项目库读取失败。'
          setStoreError(message)
          setShowLibrary(true)
        }
      } finally {
        if (!cancelled) {
          hydrated.current = true
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [importProjectFiles, setStoreError])

  useEffect(() => {
    if (!hydrated.current || switchingProject.current || !bundle || !projectId) {
      return
    }
    const timeout = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(persistCurrentProject)
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [bundle, persistCurrentProject, projectCreatedAt, projectId, settings])

  useEffect(() => {
    if (hydrated.current && projectId) {
      setShowLibrary(false)
    }
  }, [projectId])

  const scheduledFrames = useMemo(() => {
    if (!bundle || !action) {
      return []
    }
    return action.frameIds.flatMap((frameId) => {
      const frame = bundle.frames.find((candidate) => candidate.id === frameId)
      return frame ? [frame] : []
    })
  }, [action, bundle])

  const frameSchedule = useMemo(
    () => (action ? computeFrameSchedule(action, scheduledFrames) : undefined),
    [action, scheduledFrames],
  )

  useEffect(() => {
    if (!isPlaying || !action || scheduledFrames.length === 0 || !frameSchedule) {
      return
    }
    const durationMs =
      frameSchedule.frames[currentFrameIndex]?.durationMs ?? Math.max(1, 1000 / action.fps)
    const timeout = window.setTimeout(advanceFrame, Math.max(1, durationMs))
    return () => window.clearTimeout(timeout)
  }, [action, advanceFrame, currentFrameIndex, frameSchedule, isPlaying, scheduledFrames.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          useProjectStore.getState().redo()
        } else {
          useProjectStore.getState().undo()
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (event.code !== 'Space' || isEditableTarget(event.target)) {
        return
      }
      event.preventDefault()
      setPlaying(!isPlaying)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, setPlaying])

  useEffect(() => {
    if (!notice || notice.tone === 'info') {
      return
    }
    const timeout = window.setTimeout(dismissNotice, 4200)
    return () => window.clearTimeout(timeout)
  }, [dismissNotice, notice])

  const openProject = async (nextProjectId: string) => {
    if (libraryBusy) {
      return
    }
    if (nextProjectId === projectId) {
      setShowLibrary(false)
      return
    }
    setLibraryBusy(true)
    setLibraryError(undefined)
    switchingProject.current = true
    try {
      await flushCurrentProject()
      const stored = await loadProject(nextProjectId)
      if (!stored) {
        throw new Error('项目数据不存在，可能已被移除。')
      }
      await activateProject(stored.id)
      await importProjectFiles(stored.files, stored.document, {
        projectId: stored.id,
        createdAt: stored.createdAt,
      })
      setShowLibrary(false)
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目打开失败。')
    } finally {
      switchingProject.current = false
      setLibraryBusy(false)
    }
  }

  const removeProject = async (removingProjectId: string) => {
    if (libraryBusy) {
      return
    }
    const removingActive = removingProjectId === projectId
    setLibraryBusy(true)
    setLibraryError(undefined)
    switchingProject.current = true
    try {
      if (removingActive) {
        clearProject()
        useProjectStore.getState().resetProjectState()
        await saveQueue.current.catch(() => undefined)
      }
      await deleteProject(removingProjectId)
      const library = await loadProjectLibrary()
      useProjectLibraryStore.setState({
        projects: library.projects,
        activeProjectId: library.activeProjectId,
      })
      if (removingActive) {
        const nextProject = library.projects[0]
        if (nextProject) {
          await activateProject(nextProject.id)
          const stored = await loadProject(nextProject.id)
          if (stored) {
            await importProjectFiles(stored.files, stored.document, {
              projectId: stored.id,
              createdAt: stored.createdAt,
            })
            setShowLibrary(false)
          }
        } else {
          await activateProject(undefined)
          setShowLibrary(true)
        }
      }
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目移除失败。')
      await refreshLibrary()
    } finally {
      switchingProject.current = false
      setLibraryBusy(false)
    }
  }

  const renameLibraryProject = async (renamingProjectId: string, name: string) => {
    setLibraryBusy(true)
    setLibraryError(undefined)
    try {
      const summary = await renameProject(renamingProjectId, name)
      if (!summary) {
        throw new Error('项目数据不存在，可能已被移除。')
      }
      upsertProject(summary, summary.id === projectId)
      if (summary.id === projectId) {
        useProjectStore.getState().setProjectName(summary.name)
      }
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目重命名失败。')
    } finally {
      setLibraryBusy(false)
    }
  }

  return (
    <div
      className="app-shell"
      onDragEnter={(event) => {
        if (!isExternalFileDrag(event)) return
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(event) => {
        if (isExternalFileDrag(event)) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        if (!isExternalFileDrag(event)) return
        event.preventDefault()
        setIsDragging(false)
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) {
          void prepareLocalImport(files)
        }
      }}
    >
      <Toolbar
        onPickFiles={(files) => void prepareLocalImport(files)}
        onOpenGridImport={() => setShowGridImport(true)}
        onOpenLibrary={() => setShowLibrary(true)}
        onOpenImportGuide={() => setShowImportGuide(true)}
        projectCount={projects.length}
      />

      {matchingBundle ? (
        <ManualMatchPage
          key={matchingBundle.id}
          bundle={matchingBundle}
          onCancel={() => setMatchingBundle(undefined)}
          onConfirm={(matchedBundle) => {
            commitImportedBundle(matchedBundle)
            setMatchingBundle(undefined)
            setShowLibrary(false)
          }}
        />
      ) : showLibrary ? (
        <ProjectLibraryPage
          projects={projects}
          activeProjectId={activeProjectId}
          busy={libraryBusy}
          error={libraryError}
          onOpenProject={(id) => void openProject(id)}
          onRemoveProject={(id) => void removeProject(id)}
          onRenameProject={(id, name) => void renameLibraryProject(id, name)}
          onClose={() => setShowLibrary(false)}
        />
      ) : anchorCalibrationEnabled ? (
        <AnchorCalibrationPage />
      ) : (
        <main className="workspace">
          <section className="center-workspace">
            <PreviewStage onStatusChange={setRendererStatus} />
            <Timeline />
          </section>
          <InspectorPanel
            rendererStatus={rendererStatus}
            onOpenLibrary={() => setShowLibrary(true)}
          />
        </main>
      )}

      {showGridImport && <GridImportDialog onClose={() => setShowGridImport(false)} />}
      {showImportGuide && <ImportGuideDialog onClose={() => setShowImportGuide(false)} />}
      {(isImporting || isPreparingImport || isDragging) && (
        <div className={`drop-overlay ${isDragging ? 'is-dragging' : ''}`}>
          <div className="drop-card">
            <div className="drop-icon">{isImporting || isPreparingImport ? '…' : '↓'}</div>
            <strong>{isImporting || isPreparingImport ? '正在读取素材并自动配对' : '释放以导入素材'}</strong>
            <span>{isImporting || isPreparingImport ? '本地解析中，不会上传文件。' : 'PNG、JSON 与法线图可同时拖入。'}</span>
          </div>
        </div>
      )}

      {notice && (
        <button
          type="button"
          className={`notice notice-${notice.tone}`}
          onClick={dismissNotice}
        >
          <span>{notice.message}</span>
          {notice.tone === 'error' && <small>点击关闭</small>}
        </button>
      )}

      <div className="sr-status" aria-live="polite">
        {bundle ? `已载入 ${bundle.frames.length} 帧` : '尚未载入素材'}，渲染后端 {rendererStatus}
      </div>
    </div>
  )
}
