import { useRef, useState } from 'react'
import {
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
} from '../domain/projectDocument'
import { getPreviewExporter } from '../renderer/previewExportRegistry'
import {
  exportPortableJson,
  exportProjectZip,
  importPortableJson,
  importProjectZip,
} from '../services/projectIO'
import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import { downloadBlob, downloadText } from '../utils/download'

interface ProjectPanelProps {
  rendererStatus: string
}

export function ProjectPanel({ rendererStatus }: ProjectPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string>()
  const bundle = useEditorStore((state) => state.bundle)
  const warnings = useEditorStore((state) => state.warnings)
  const settings = useEditorStore((state) => state.settings)
  const importProjectFiles = useEditorStore((state) => state.importProjectFiles)
  const applyProjectDocument = useEditorStore((state) => state.applyProjectDocument)
  const projectName = useProjectStore((state) => state.projectName)
  const palettePresets = useProjectStore((state) => state.palettePresets)
  const activePaletteId = useProjectStore((state) => state.activePaletteId)
  const lighting = useProjectStore((state) => state.lighting)
  const renderPreferences = useProjectStore((state) => state.renderPreferences)
  const setProjectName = useProjectStore((state) => state.setProjectName)
  const updateRenderPreferences = useProjectStore((state) => state.updateRenderPreferences)

  const buildDocument = () => {
    if (!bundle) {
      throw new Error('请先导入素材。')
    }
    return createProjectDocument(
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
  }

  const safeName = projectName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'sprite-project'

  return (
    <div className="inspector-content project-panel">
      <section className="inspector-section">
        <label className="field">
          <span>项目名称</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
      </section>

      <section className="inspector-section key-value-list">
        <div>
          <span>数据来源</span>
          <strong>{bundle?.sourceName ?? '尚未导入'}</strong>
        </div>
        <div>
          <span>渲染后端</span>
          <strong>{rendererStatus}</strong>
        </div>
        <div>
          <span>色板模式</span>
          <strong>{bundle?.paletteMode === 'indexed' ? '索引色' : '全彩'}</strong>
        </div>
        <div>
          <span>隐私</span>
          <strong>仅本地处理</strong>
        </div>
      </section>

      <section className="inspector-section">
        <strong>PNG 导出</strong>
        <div className="export-stack">
          <button
            type="button"
            className="button"
            disabled={!bundle}
            onClick={async () => {
              try {
                const blob = await getPreviewExporter()?.exportViewportPng()
                if (blob) {
                  downloadBlob(blob, `${safeName}-preview.png`)
                  setMessage('已导出当前预览。')
                }
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '预览导出失败。')
              }
            }}
          >
            导出当前预览
          </button>
          <button
            type="button"
            className="button"
            disabled={!bundle}
            onClick={async () => {
              try {
                const blob = await getPreviewExporter()?.exportFramePng()
                if (blob) {
                  downloadBlob(blob, `${safeName}-frame.png`)
                  setMessage('已导出透明背景当前帧。')
                }
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '当前帧导出失败。')
              }
            }}
          >
            导出透明当前帧
          </button>
        </div>
      </section>

      <section className="inspector-section">
        <strong>项目文件</strong>
        <div className="export-stack">
          <button
            type="button"
            className="button"
            disabled={!bundle}
            onClick={() => {
              try {
                downloadText(
                  serializeProjectDocument(buildDocument()),
                  `${safeName}.spritelab.json`,
                  'application/json',
                )
                setMessage('已导出轻量项目 JSON。')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '项目导出失败。')
              }
            }}
          >
            导出轻量 JSON
          </button>
          <button
            type="button"
            className="button"
            disabled={!bundle}
            onClick={async () => {
              try {
                const json = await exportPortableJson(buildDocument(), bundle!)
                downloadText(json, `${safeName}-portable.json`, 'application/json')
                setMessage('已导出自包含 JSON。')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '自包含 JSON 导出失败。')
              }
            }}
          >
            导出自包含 JSON
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!bundle}
            onClick={async () => {
              try {
                const bytes = await exportProjectZip(buildDocument(), bundle!)
                downloadBlob(
                  new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }),
                  `${safeName}.spritelab.zip`,
                )
                setMessage('已导出 ZIP 项目包。')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'ZIP 导出失败。')
              }
            }}
          >
            导出 ZIP 项目包
          </button>
          <button
            type="button"
            className="button"
            onClick={() => fileInput.current?.click()}
          >
            导入项目
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".json,.zip,application/json,application/zip"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) {
                return
              }
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
                setMessage('项目导入完成。')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '项目导入失败。')
              }
            }}
          />
        </div>
        {message && <p className="field-help">{message}</p>}
      </section>

      <section className="inspector-section">
        <strong>渲染选项</strong>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={renderPreferences.pixelPerfect}
            onChange={(event) =>
              updateRenderPreferences({ pixelPerfect: event.target.checked })
            }
          />
          像素级采样
        </label>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>问题</strong>
          <span>{warnings.length}</span>
        </div>
        <div className="warning-list">
          {warnings.length === 0 ? (
            <div className="success-card">当前没有需要处理的问题。</div>
          ) : (
            warnings.map((warning, index) => (
              <div
                className={`warning-card warning-${warning.severity}`}
                key={`${warning.code}:${warning.frameId ?? index}:${index}`}
              >
                <strong>{warning.severity === 'error' ? '阻止配对' : '注意'}</strong>
                <span>{warning.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}