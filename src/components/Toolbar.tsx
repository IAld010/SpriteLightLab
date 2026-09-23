import { useEffect, useRef, useState } from 'react'
import { parseProjectDocument } from '../domain/projectDocument'
import {
  currentProjectFileName,
  exportCurrentProjectZip,
} from '../services/currentProjectSnapshot'
import { importPortableJson, importProjectZip } from '../services/projectIO'
import { isZipArchive } from '../domain/zip'
import { useEditorStore } from '../store/editorStore'
import { downloadBlob } from '../utils/download'
import type { BackendPreference } from '../domain/types'
import { useI18n } from '../i18n'

interface ToolbarProps {
  onPickFiles: (files: File[]) => void
  onOpenGridImport: () => void
  onOpenLibrary: () => void
  onOpenImportGuide: () => void
  onOpenProjectEditor: () => void
  onBeforeProjectChange: () => Promise<void>
  projectEditorAvailable: boolean
  projectCount: number
}

export function Toolbar({
  onPickFiles,
  onOpenGridImport,
  onOpenLibrary,
  onOpenImportGuide,
  onOpenProjectEditor,
  onBeforeProjectChange,
  projectEditorAvailable,
  projectCount,
}: ToolbarProps) {
  const { language, setLanguage, t } = useI18n()
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const demoPickerRef = useRef<HTMLDivElement>(null)
  const [demoMenuOpen, setDemoMenuOpen] = useState(false)
  const backend = useEditorStore((state) => state.settings.backend)
  const textureMode = useEditorStore((state) => state.settings.textureMode)
  const isImporting = useEditorStore((state) => state.isImporting)
  const hasBundle = useEditorStore((state) => Boolean(state.bundle))
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
    void (async () => {
      try {
        await onBeforeProjectChange()
        await load()
      } catch {
        // A failed pre-switch save is already reported by the caller.
      }
    })()
  }

  const exportProjectPackage = async () => {
    try {
      const bytes = await exportCurrentProjectZip()
      downloadBlob(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }),
        `${currentProjectFileName()}.spritelab.zip`,
      )
      setNotice({ tone: 'success', message: '已导出 ZIP 项目包。' })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'ZIP 导出失败。',
      })
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isImporting}
        >
          {t('选择素材文件')}
        </button>
        <button
          className="button"
          type="button"
          onClick={onOpenGridImport}
          data-testid="open-grid-import"
        >
          {t('大图裁切')}
        </button>
        <button className="button" type="button" onClick={() => projectInput.current?.click()}>
          {t('导入项目包')}
        </button>
        <button
          className="button"
          type="button"
          data-testid="export-project-zip"
          disabled={!hasBundle}
          onClick={() => void exportProjectPackage()}
        >
          {t('导出项目包')}
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
            {t('示例项目 ▾')}
          </button>
          {demoMenuOpen && (
            <div className="demo-menu" role="menu" data-testid="demo-menu">
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadDemo)}
              >
                <strong>{t('普通演示')}</strong>
                <span>{t('索引色、法线光照和基础帧预览')}</span>
              </button>
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadFullColorDemo)}
              >
                <strong>{t('全彩演示')}</strong>
                <span>{t('渐变色、全彩调色规则和全局调整')}</span>
              </button>
              <button
                type="button"
                className="demo-option"
                role="menuitem"
                onClick={() => chooseDemo(loadDefoldSample)}
              >
                <strong>{t('Defold 示例')}</strong>
                <span>{t('16 帧完整动作，包含 diffuse 和 normal 配对')}</span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="button"
          onClick={onOpenLibrary}
          data-testid="open-project-library"
        >
          {t('项目库')} {projectCount > 0 ? `(${projectCount})` : ''}
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onOpenProjectEditor}
          disabled={!projectEditorAvailable}
          data-testid="open-project-editor"
        >
          {t('\u9879\u76ee\u7f16\u8f91\u5668')}
        </button>
        <button
          type="button"
          className="button button-help"
          onClick={onOpenImportGuide}
          data-testid="open-import-guide"
        >
          {t('? 导入说明')}
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
              await onBeforeProjectChange()
              const bytes = new Uint8Array(await file.arrayBuffer())
              if (isZipArchive(bytes)) {
                const portable = await importProjectZip(bytes)
                await importProjectFiles(portable.files, portable.document, undefined, portable.refinementAssets)
              } else {
                const content = new TextDecoder().decode(bytes)
                const parsed = JSON.parse(content) as { format?: string }
                if (parsed.format === 'sprite-light-lab-portable') {
                  const portable = importPortableJson(content)
                  if (portable.files.length > 0) {
                    await importProjectFiles(
                      portable.files,
                      portable.document,
                      undefined,
                      portable.refinementAssets,
                    )
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
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            await onBeforeProjectChange()
            onPickFiles(files)
          }}
        />
      </div>

      <div className="toolbar-settings">
        <div className="segmented language-switch" aria-label={t('界面语言')}>
          <button
            type="button"
            className={language === 'zh-CN' ? 'is-active' : ''}
            aria-pressed={language === 'zh-CN'}
            onClick={() => setLanguage('zh-CN')}
          >
            中文
          </button>
          <button
            type="button"
            className={language === 'en' ? 'is-active' : ''}
            aria-pressed={language === 'en'}
            onClick={() => setLanguage('en')}
          >
            English
          </button>
        </div>
        <label className="compact-control">
          <span>{t('渲染后端')}</span>
          <select
            value={backend}
            onChange={(event) => setBackend(event.target.value as BackendPreference)}
          >
            <option value="webgl">WebGL2</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </label>
        <div className="segmented" aria-label={t('预览纹理')}>
          <button
            type="button"
            className={textureMode === 'color' ? 'is-active' : ''}
            onClick={() => setTextureMode('color')}
          >
            {t('颜色图')}
          </button>
          <button
            type="button"
            className={textureMode === 'normal' ? 'is-active' : ''}
            onClick={() => setTextureMode('normal')}
          >
            {t('法线图')}
          </button>
        </div>
      </div>
    </header>
  )
}
