import { useEffect, useRef, useState } from 'react'
import './App.css'
import { ActionSidebar } from './components/ActionSidebar'
import { InspectorPanel } from './components/InspectorPanel'
import { PreviewStage } from './components/PreviewStage'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { createProjectDocument } from './domain/projectDocument'
import { loadWorkspace, saveWorkspace } from './services/projectPersistence'
import { getSelectedAction, useEditorStore } from './store/editorStore'
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
  const hydrated = useRef(false)
  const bundle = useEditorStore((state) => state.bundle)
  const isImporting = useEditorStore((state) => state.isImporting)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const notice = useEditorStore((state) => state.notice)
  const importLocalFiles = useEditorStore((state) => state.importLocalFiles)
  const dismissNotice = useEditorStore((state) => state.dismissNotice)
  const advanceFrame = useEditorStore((state) => state.advanceFrame)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const action = useEditorStore((state) => getSelectedAction(state))
  const settings = useEditorStore((state) => state.settings)
  const importProjectFiles = useEditorStore((state) => state.importProjectFiles)
  const projectName = useProjectStore((state) => state.projectName)
  const palettePresets = useProjectStore((state) => state.palettePresets)
  const activePaletteId = useProjectStore((state) => state.activePaletteId)
  const lighting = useProjectStore((state) => state.lighting)
  const renderPreferences = useProjectStore((state) => state.renderPreferences)

  useEffect(() => {
    let cancelled = false
    void loadWorkspace()
      .then(async (workspace) => {
        if (!cancelled && workspace && workspace.files.length > 0) {
          await importProjectFiles(workspace.files, workspace.document)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated.current = true
      })
    return () => {
      cancelled = true
    }
  }, [importProjectFiles])

  useEffect(() => {
    if (!hydrated.current || !bundle) {
      return
    }
    const timeout = window.setTimeout(() => {
      const document = createProjectDocument(
        bundle,
        {
          projectName,
          palettePresets,
          activePaletteId,
          lighting,
          renderPreferences,
        },
        settings,
      )
      void saveWorkspace(document, bundle)
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [
    activePaletteId,
    bundle,
    lighting,
    palettePresets,
    projectName,
    renderPreferences,
    settings,
  ])

  useEffect(() => {
    if (!isPlaying || !action || action.frameIds.length === 0) {
      return
    }
    const interval = window.setInterval(() => advanceFrame(), Math.max(16, 1000 / action.fps))
    return () => window.clearInterval(interval)
  }, [action, advanceFrame, isPlaying])

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

  return (
    <div
      className="app-shell"
      onDragEnter={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        void importLocalFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <Toolbar onPickFiles={(files) => void importLocalFiles(files)} />

      <main className="workspace">
        <ActionSidebar />
        <section className="center-workspace">
          <PreviewStage onStatusChange={setRendererStatus} />
          <Timeline />
        </section>
        <InspectorPanel rendererStatus={rendererStatus} />
      </main>

      {(isImporting || isDragging) && (
        <div className={`drop-overlay ${isDragging ? 'is-dragging' : ''}`}>
          <div className="drop-card">
            <div className="drop-icon">{isImporting ? '…' : '↓'}</div>
            <strong>{isImporting ? '正在读取素材与配对法线图' : '释放以导入素材'}</strong>
            <span>{isImporting ? '本地解析中，不会上传文件。' : 'PNG、JSON 与法线图可同时拖入。'}</span>
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