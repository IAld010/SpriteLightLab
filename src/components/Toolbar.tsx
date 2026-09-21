import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../version'
import { parseProjectDocument } from '../domain/projectDocument'
import { importPortableJson, importProjectZip } from '../services/projectIO'
import { useEditorStore } from '../store/editorStore'
import type { BackendPreference } from '../domain/types'

interface ToolbarProps {
  onPickFiles: (files: File[]) => void
  onOpenGridImport: () => void
  onOpenLibrary: () => void
  onOpenImportGuide: () => void
  projectCount: number
}

export function Toolbar({
  onPickFiles,
  onOpenGridImport,
  onOpenLibrary,
  onOpenImportGuide,
  projectCount,
}: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const demoPickerRef = useRef<HTMLDivElement>(null)
  const [demoMenuOpen, setDemoMenuOpen] = useState(false)
  const backend = useEditorStore((state) => state.settings.backend)
  const textureMode = useEditorStore((state) => state.settings.textureMode)
  const isImporting = useEditorStore((state) => state.isImporting)
  const importProjectFiles = useEditorStore((state) => state.importProjectFiles)
  const applyProjectDocument = useEditorStore((state) => state.applyProjectDocument)
  const setNotice = useEditorStore((state) => state.setNotice)
  const loadDemo = useEditorStore((state) => state.loadDemo)
  const loadFullColorDemo = useEditorStore((state) => state.loadFullColorDemo)
  const loadDefoldSample = useEditorStore((state) => state.loadDefoldSample)
  const setBackend = useEditorStore((state) => state.setBackend)
  const setTextureMode = useEditorStore((state) => state.setTextureMode)

  useEffect(() => {
    if (!demoMenuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!demoPickerRef.current?.contains(event.target as Node)) {
        setDemoMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDemoMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [demoMenuOpen])

  const chooseDemo = (load: () => Promise<void>) => {
    setDemoMenuOpen(false)
    void load()
  }

  return (
    <header className="toolbar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          SL
        </div>
        <div>
          <strong>Sprite Light Lab</strong>
          <span>本地精灵整合与预览工作台 · v{APP_VERSION}</span>
        </div>
      </div>

      <div className="toolbar-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isImporting}
        >
          选择素材文件
        </button>
        <button
          className="button"
          type="button"
          onClick={onOpenGridImport}
          data-testid="open-grid-import"
        >
          大图裁切
        </button>
        <div className="demo-picker" ref={demoPickerRef}>
          <button
            className="button"
            type="button"
            aria-haspopup="menu"
            aria-expanded={demoMenuOpen}
            onClick={() => setDemoMenuOpen((open) => !open)}
            data-testid="demo-picker-trigger"
          >
            示例项目 ▾
          </button>
          {demoMenuOpen && (
            <div className="demo-menu" role="menu" data-testid="demo-menu">
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadDemo)}
              >
                <strong>普通演示</strong>
                <span>索引色、法线光照和基础帧预览</span>
              </button>
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadFullColorDemo)}
              >
                <strong>全彩演示</strong>
                <span>渐变色、全彩调色规则和全局调整</span>
              </button>
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadDefoldSample)}
              >
                <strong>Defold 示例</strong>
                <span>16 帧完整动作，包含 diffuse 和 normal 配对</span>
              </button>
            </div>
          )}
        </div>
        <button className="button" type="button" onClick={() => projectInput.current?.click()}>
          导入项目包
        </button>
        <button
          type="button"
          className="button"
          onClick={onOpenLibrary}
          data-testid="open-project-library"
        >
          项目库 {projectCount > 0 ? `(${projectCount})` : ''}
        </button>
        <button
          type="button"
          className="button button-help"
          onClick={onOpenImportGuide}
          data-testid="open-import-guide"
        >
          ? 导入说明
        </button>
        <input
          ref={projectInput}
          className="visually-hidden"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setNotice({ tone: 'info', message: '正在导入项目包…' })
            try {
              if (file.name.toLowerCase().endsWith('.zip')) {
                const portable = await importProjectZip(await file.arrayBuffer())
                await importProjectFiles(portable.files, portable.document)
              } else {
                const content = await file.text()
                const parsed = JSON.parse(content) as { format?: string }
                if (parsed.format === 'sprite-light-lab-portable') {
                  const portable = importPortableJson(content)
                  if (portable.files.length > 0) {
                    await importProjectFiles(portable.files, portable.document)
                  } else {
                    applyProjectDocument(portable.document)
                  }
                } else {
                  applyProjectDocument(parseProjectDocument(content))
                }
              }
            } catch (error) {
              console.error(error)
              setNotice({
                tone: 'error',
                message: error instanceof Error ? error.message : '项目包导入失败。',
              })
            }
          }}
        />
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".png,.json,image/png,application/json"
          multiple
          onChange={(event) => {
            onPickFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      <div className="toolbar-settings">
        <label className="compact-control">
          <span>渲染后端</span>
          <select
            value={backend}
            onChange={(event) => setBackend(event.target.value as BackendPreference)}
          >
            <option value="webgl">WebGL2</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </label>
        <div className="segmented" aria-label="预览纹理">
          <button
            type="button"
            className={textureMode === 'color' ? 'is-active' : ''}
            onClick={() => setTextureMode('color')}
          >
            颜色图
          </button>
          <button
            type="button"
            className={textureMode === 'normal' ? 'is-active' : ''}
            onClick={() => setTextureMode('normal')}
          >
            法线图
          </button>
        </div>
      </div>
    </header>
  )
}
