import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createGridRects,
  readGridImageSize,
  validateGridConfig,
  type GridImageSize,
} from '../domain/gridImport'
import type { GridImportConfig, Rect } from '../domain/types'
import { useEditorStore } from '../store/editorStore'
import { ImportRulesPanel } from './ImportRulesPanel'

interface GridImportDialogProps {
  onClose: () => void
}

const DEFAULT_GRID: GridImportConfig = {
  frameWidth: 32,
  frameHeight: 32,
  columns: 4,
  rows: 4,
  offsetX: 0,
  offsetY: 0,
  spacingX: 0,
  spacingY: 0,
  frameOrder: 'row-major',
}

function useObjectUrl(file?: File): string | undefined {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file])
  useEffect(
    () => () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    },
    [url],
  )
  return url
}

function defaultGridFor(size: GridImageSize): GridImportConfig {
  const columns = size.width >= 4 && size.width % 4 === 0 ? 4 : 1
  const rows = size.height >= 4 && size.height % 4 === 0 ? 4 : 1
  return {
    ...DEFAULT_GRID,
    columns,
    rows,
    frameWidth: Math.max(1, Math.floor(size.width / columns)),
    frameHeight: Math.max(1, Math.floor(size.height / rows)),
  }
}

function NumberField({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string
  value: number
  min?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid-number-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function GridPreview({
  label,
  file,
  size,
  rects,
  tone,
}: {
  label: string
  file?: File
  size?: GridImageSize
  rects: Rect[]
  tone: 'color' | 'normal'
}) {
  const url = useObjectUrl(file)
  const showLabels = rects.length <= 64

  return (
    <div className={`grid-preview-card grid-preview-${tone}`}>
      <div className="grid-preview-heading">
        <strong>{label}</strong>
        <span>{size ? `${size.width}×${size.height}` : '未选择'}</span>
      </div>
      <div
        className="grid-preview-canvas"
        style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
      >
        {url && <img src={url} alt={`${label}预览`} />}
        {!url && <div className="grid-preview-empty">选择图片后显示切片预览</div>}
        {url &&
          size &&
          rects.map((rect, index) => (
            <div
              className="grid-cell-overlay"
              key={`${rect.x}:${rect.y}:${index}`}
              style={{
                left: `${(rect.x / size.width) * 100}%`,
                top: `${(rect.y / size.height) * 100}%`,
                width: `${(rect.width / size.width) * 100}%`,
                height: `${(rect.height / size.height) * 100}%`,
              }}
            >
              {showLabels && <span>{index + 1}</span>}
            </div>
          ))}
      </div>
    </div>
  )
}

export function GridImportDialog({ onClose }: GridImportDialogProps) {
  const importGridFiles = useEditorStore((state) => state.importGridFiles)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const normalInputRef = useRef<HTMLInputElement>(null)
  const [colorFile, setColorFile] = useState<File>()
  const [normalFile, setNormalFile] = useState<File>()
  const [colorSize, setColorSize] = useState<GridImageSize>()
  const [normalSize, setNormalSize] = useState<GridImageSize>()
  const [config, setConfig] = useState<GridImportConfig>(DEFAULT_GRID)
  const [customConfig, setCustomConfig] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose])

  const warnings = colorSize
    ? validateGridConfig(config, colorSize, normalSize)
    : []
  const errors = warnings.filter((warning) => warning.severity === 'error')
  const rects =
    colorSize &&
    config.frameWidth > 0 &&
    config.frameHeight > 0 &&
    config.columns > 0 &&
    config.rows > 0
      ? createGridRects(config)
      : []

  const updateConfig = (patch: Partial<GridImportConfig>) => {
    setCustomConfig(true)
    setConfig((current) => ({ ...current, ...patch }))
  }

  const chooseColorFile = async (file?: File) => {
    if (!file) {
      return
    }
    setFileError(undefined)
    try {
      const size = await readGridImageSize(file)
      setColorFile(file)
      setColorSize(size)
      if (!customConfig) {
        setConfig(defaultGridFor(size))
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '颜色图读取失败。')
    }
  }

  const chooseNormalFile = async (file?: File) => {
    if (!file) {
      return
    }
    setFileError(undefined)
    try {
      const size = await readGridImageSize(file)
      setNormalFile(file)
      setNormalSize(size)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '法线图读取失败。')
    }
  }

  const divideEvenly = () => {
    if (!colorSize) {
      return
    }
    const width = Math.floor(
      (colorSize.width - config.offsetX - (config.columns - 1) * config.spacingX) /
        config.columns,
    )
    const height = Math.floor(
      (colorSize.height - config.offsetY - (config.rows - 1) * config.spacingY) /
        config.rows,
    )
    if (width > 0 && height > 0) {
      setConfig((current) => ({ ...current, frameWidth: width, frameHeight: height }))
      setCustomConfig(true)
    }
  }

  const confirmImport = async () => {
    if (!colorFile || errors.length > 0) {
      return
    }
    setBusy(true)
    const imported = await importGridFiles(colorFile, normalFile, config)
    setBusy(false)
    if (imported) {
      onClose()
    }
  }

  return (
    <div className="dialog-backdrop grid-import-backdrop" role="presentation">
      <section
        className="grid-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-import-title"
        data-testid="grid-import-dialog"
      >
        <header className="grid-import-header">
          <div>
            <div className="eyebrow">大图裁切</div>
            <h1 id="grid-import-title">网格精灵与法线图</h1>
            <p>选择颜色大图和可选法线大图，使用同一组网格参数生成动画帧。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="button" onClick={onClose} disabled={busy}>
            关闭
          </button>
        </header>

        <div className="grid-import-content">
          <aside className="grid-import-settings">
            <section className="inspector-section">
              <strong>选择图片</strong>
              <div className="grid-file-row">
                <div>
                  <span>颜色大图</span>
                  <small>{colorSize ? `${colorSize.width}×${colorSize.height}` : '必选'}</small>
                </div>
                <button type="button" className="button" onClick={() => colorInputRef.current?.click()}>
                  选择
                </button>
              </div>
              <div className="grid-file-row">
                <div>
                  <span>法线大图</span>
                  <small>
                    {normalSize
                      ? `${normalSize.width}×${normalSize.height}`
                      : normalFile
                        ? '读取中'
                        : '可选，缺失时使用平坦法线'}
                  </small>
                </div>
                <button type="button" className="button" onClick={() => normalInputRef.current?.click()}>
                  选择
                </button>
                {normalFile && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => {
                      setNormalFile(undefined)
                      setNormalSize(undefined)
                    }}
                  >
                    清除
                  </button>
                )}
              </div>
              <input
                ref={colorInputRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/*"
                onChange={(event) => {
                  void chooseColorFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <input
                ref={normalInputRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/*"
                onChange={(event) => {
                  void chooseNormalFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </section>

            <section className="inspector-section">
              <div className="section-title-row">
                <strong>网格参数</strong>
                <button type="button" className="mini-button" onClick={divideEvenly} disabled={!colorSize}>
                  按行列均分
                </button>
              </div>
              <div className="grid-number-grid">
                <NumberField label="帧宽" value={config.frameWidth} min={1} onChange={(frameWidth) => updateConfig({ frameWidth })} />
                <NumberField label="帧高" value={config.frameHeight} min={1} onChange={(frameHeight) => updateConfig({ frameHeight })} />
                <NumberField label="列数" value={config.columns} min={1} onChange={(columns) => updateConfig({ columns })} />
                <NumberField label="行数" value={config.rows} min={1} onChange={(rows) => updateConfig({ rows })} />
                <NumberField label="左边距" value={config.offsetX} onChange={(offsetX) => updateConfig({ offsetX })} />
                <NumberField label="上边距" value={config.offsetY} onChange={(offsetY) => updateConfig({ offsetY })} />
                <NumberField label="水平间距" value={config.spacingX} onChange={(spacingX) => updateConfig({ spacingX })} />
                <NumberField label="垂直间距" value={config.spacingY} onChange={(spacingY) => updateConfig({ spacingY })} />
              </div>
              <label className="field">
                <span>排列顺序</span>
                <select
                  value={config.frameOrder}
                  onChange={(event) =>
                    updateConfig({ frameOrder: event.target.value as GridImportConfig['frameOrder'] })
                  }
                >
                  <option value="row-major">从左到右，再换下一行</option>
                  <option value="column-major">从上到下，再换下一列</option>
                </select>
              </label>
            </section>

            {fileError && (
              <div className="project-library-error" role="alert">
                {fileError}
              </div>
            )}
            {warnings.map((warning, index) => (
              <div
                className={`warning-card warning-${warning.severity}`}
                key={`${warning.code}:${index}`}
                role="alert"
              >
                <strong>{warning.severity === 'error' ? '阻止导入' : '注意'}</strong>
                <span>{warning.message}</span>
              </div>
            ))}
          </aside>

          <section className="grid-import-preview">
            <div className="grid-preview-pair">
              <GridPreview label="颜色图" file={colorFile} size={colorSize} rects={rects} tone="color" />
              <GridPreview label="法线图" file={normalFile} size={normalSize} rects={normalFile ? rects : []} tone="normal" />
            </div>
            <div className="grid-summary-card">
              <div>
                <span>预计帧数</span>
                <strong>{rects.length}</strong>
              </div>
              <div>
                <span>动作数</span>
                <strong>{rects.length > 0 ? 1 : 0}</strong>
              </div>
              <div>
                <span>法线状态</span>
                <strong>{normalFile ? (errors.length > 0 ? '尺寸错误' : '已配对') : '平坦法线'}</strong>
              </div>
            </div>
          </section>

          <ImportRulesPanel colorSize={colorSize} normalSize={normalSize} />
        </div>

        <footer className="grid-import-footer">
          <span>{errors.length > 0 ? '请修正错误后再确认导入。' : '确认后会创建为一个新的本地项目。'}</span>
          <div>
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!colorFile || errors.length > 0 || busy}
              onClick={() => void confirmImport()}
            >
              {busy ? '正在导入…' : `确认导入 ${rects.length > 0 ? `${rects.length} 帧` : ''}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}