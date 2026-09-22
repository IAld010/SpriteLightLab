import { useEffect, useRef, useState } from 'react'
import {
  createGridRects,
  readGridImageSize,
  validateGridConfig,
  type GridImageSize,
} from '../domain/gridImport'
import type { GridImportConfig, Rect, RegionImportConfig } from '../domain/types'
import { DEFAULT_REGION_CONFIG, validateRegionConfig } from '../domain/regionImport'
import { RegionImportWorkspace } from './RegionImportWorkspace'
import { useEditorStore } from '../store/editorStore'
import { ImportRulesPanel } from './ImportRulesPanel'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { t } from '../i18n'

interface GridImportDialogProps {
  onClose: () => void
  onBeforeImport: () => Promise<void>
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
        <span>{size ? `${size.width}×${size.height}` : t('未选择')}</span>
      </div>
      <div
        className="grid-preview-canvas"
        style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
      >
        {url && <img src={url} alt={t('{label}预览', { label })} />}
        {!url && <div className="grid-preview-empty">{t('选择图片后显示切片预览')}</div>}
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

export function GridImportDialog({ onClose, onBeforeImport }: GridImportDialogProps) {
  const importGridFiles = useEditorStore((state) => state.importGridFiles)
  const importRegionFiles = useEditorStore((state) => state.importRegionFiles)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const normalInputRef = useRef<HTMLInputElement>(null)
  const [colorFile, setColorFile] = useState<File>()
  const [normalFile, setNormalFile] = useState<File>()
  const [colorSize, setColorSize] = useState<GridImageSize>()
  const [normalSize, setNormalSize] = useState<GridImageSize>()
  const [cropMode, setCropMode] = useState<'grid' | 'regions'>('grid')
  const [config, setConfig] = useState<GridImportConfig>(DEFAULT_GRID)
  const [regionConfig, setRegionConfig] = useState<RegionImportConfig>(DEFAULT_REGION_CONFIG)
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
    ? cropMode === 'grid'
      ? validateGridConfig(config, colorSize, normalSize)
      : validateRegionConfig(regionConfig, colorSize, normalSize)
    : []
  const errors = warnings.filter((warning) => warning.severity === 'error')
  const rects = cropMode === 'regions'
    ? regionConfig.regions
    : colorSize &&
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
      setRegionConfig({ ...DEFAULT_REGION_CONFIG })
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
    try {
      await onBeforeImport()
    } catch {
      setBusy(false)
      return
    }
    const imported = cropMode === 'grid'
      ? await importGridFiles(colorFile, normalFile, config)
      : await importRegionFiles(colorFile, normalFile, regionConfig)
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
            <div className="eyebrow">{t('大图裁切')}</div>
            <h1 id="grid-import-title">{cropMode === 'grid' ? t('固定网格切图') : t('不规则区域切图')}</h1>
            <p>{cropMode === 'grid' ? t('使用帧宽、帧高、行列和间距运行规则切图。') : t('自动检测透明分隔的区域，也可以手动拖动、缩放、新增和合并矩形。')}</p>
            <div className="grid-import-mode-switch">
              <button type="button" className={cropMode === 'grid' ? 'is-active' : ''} onClick={() => setCropMode('grid')}>{t('固定网格')}</button>
              <button type="button" className={cropMode === 'regions' ? 'is-active' : ''} onClick={() => setCropMode('regions')}>{t('不规则区域')}</button>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className="button" onClick={onClose} disabled={busy}>
            {t('关闭')}
          </button>
        </header>

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

        <div className="grid-import-content">
          {cropMode === 'grid' ? (
            <>
          <aside className="grid-import-settings">
            <section className="inspector-section">
              <strong>{t('选择图片')}</strong>
              <div className="grid-file-row">
                <div>
                  <span>{t('颜色大图')}</span>
                  <small>{colorSize ? `${colorSize.width}×${colorSize.height}` : t('必选')}</small>
                </div>
                <button type="button" className="button" onClick={() => colorInputRef.current?.click()}>
                  {t('选择')}
                </button>
              </div>
              <div className="grid-file-row">
                <div>
                  <span>{t('法线大图')}</span>
                  <small>
                    {normalSize
                      ? `${normalSize.width}×${normalSize.height}`
                      : normalFile
                        ? t('读取中')
                        : t('可选，缺失时使用平坦法线')}
                  </small>
                </div>
                <button type="button" className="button" onClick={() => normalInputRef.current?.click()}>
                  {t('选择')}
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
                    {t('清除')}
                  </button>
                )}
              </div>

            </section>

            <section className="inspector-section">
              <div className="section-title-row">
                <strong>{t('网格参数')}</strong>
                <button type="button" className="mini-button" onClick={divideEvenly} disabled={!colorSize}>
                  {t('按行列均分')}
                </button>
              </div>
              <div className="grid-number-grid">
                <NumberField label={t('帧宽')} value={config.frameWidth} min={1} onChange={(frameWidth) => updateConfig({ frameWidth })} />
                <NumberField label={t('帧高')} value={config.frameHeight} min={1} onChange={(frameHeight) => updateConfig({ frameHeight })} />
                <NumberField label={t('列数')} value={config.columns} min={1} onChange={(columns) => updateConfig({ columns })} />
                <NumberField label={t('行数')} value={config.rows} min={1} onChange={(rows) => updateConfig({ rows })} />
                <NumberField label={t('左边距')} value={config.offsetX} onChange={(offsetX) => updateConfig({ offsetX })} />
                <NumberField label={t('上边距')} value={config.offsetY} onChange={(offsetY) => updateConfig({ offsetY })} />
                <NumberField label={t('水平间距')} value={config.spacingX} onChange={(spacingX) => updateConfig({ spacingX })} />
                <NumberField label={t('垂直间距')} value={config.spacingY} onChange={(spacingY) => updateConfig({ spacingY })} />
              </div>
              <label className="field">
                <span>{t('排列顺序')}</span>
                <select
                  value={config.frameOrder}
                  onChange={(event) =>
                    updateConfig({ frameOrder: event.target.value as GridImportConfig['frameOrder'] })
                  }
                >
                  <option value="row-major">{t('从左到右，再换下一行')}</option>
                  <option value="column-major">{t('从上到下，再换下一列')}</option>
                </select>
              </label>
            </section>

            {fileError && (
              <div className="project-library-error" role="alert">
                {t(fileError)}
              </div>
            )}
            {warnings.map((warning, index) => (
              <div
                className={`warning-card warning-${warning.severity}`}
                key={`${warning.code}:${index}`}
                role="alert"
              >
                <strong>{warning.severity === 'error' ? t('阻止导入') : t('注意')}</strong>
                <span>{t(warning.message)}</span>
              </div>
            ))}
          </aside>

          <section className="grid-import-preview">
            <div className="grid-preview-pair">
              <GridPreview label={t('颜色图')} file={colorFile} size={colorSize} rects={rects} tone="color" />
              <GridPreview label={t('法线图')} file={normalFile} size={normalSize} rects={normalFile ? rects : []} tone="normal" />
            </div>
            <div className="grid-summary-card">
              <div>
                <span>{t('预计帧数')}</span>
                <strong>{rects.length}</strong>
              </div>
              <div>
                <span>{t('动作数')}</span>
                <strong>{rects.length > 0 ? 1 : 0}</strong>
              </div>
              <div>
                <span>{t('法线状态')}</span>
                <strong>{normalFile ? (errors.length > 0 ? t('尺寸错误') : t('已配对')) : t('平坦法线')}</strong>
              </div>
            </div>
          </section>

          <ImportRulesPanel colorSize={colorSize} normalSize={normalSize} />
            </>
          ) : (
            <RegionImportWorkspace
              colorFile={colorFile}
              normalFile={normalFile}
              colorSize={colorSize}
              normalSize={normalSize}
              config={regionConfig}
              onChange={setRegionConfig}
              onError={setFileError}
            />
          )}
        </div>

        <footer className="grid-import-footer">
          <span>{errors.length > 0 ? t('请修正错误后再确认导入。') : t('确认后会创建为一个新的本地项目。')}</span>
          <div>
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              {t('取消')}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!colorFile || errors.length > 0 || busy}
              onClick={() => void confirmImport()}
            >
              {busy
                ? t('正在导入…')
                : t('确认导入 {count}', {
                    count: rects.length > 0 ? t('{count} 帧', { count: rects.length }) : '',
                  })}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
