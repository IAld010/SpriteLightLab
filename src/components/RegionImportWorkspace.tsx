import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectRegionsFromImageDataAsync,
  readRegionImageData,
  sortRegionRectangles,
  validateRegionConfig,
} from '../domain/regionImport'
import type { RegionImportConfig, Rect } from '../domain/types'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { t } from '../i18n'

interface RegionImportWorkspaceProps {
  colorFile?: File
  normalFile?: File
  colorSize?: { width: number; height: number }
  normalSize?: { width: number; height: number }
  config: RegionImportConfig
  onChange: (config: RegionImportConfig) => void
  onError: (message?: string) => void
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid-number-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function RegionEditor({
  imageUrl,
  size,
  regions,
  selectedIndex,
  onSelect,
  onChange,
}: {
  imageUrl?: string
  size?: { width: number; height: number }
  regions: Rect[]
  selectedIndex: number
  onSelect: (index: number) => void
  onChange: (regions: Rect[]) => void
}) {
  const dragRef = useRef<{
    index: number
    handle: string
    startX: number
    startY: number
    bounds: DOMRect
    original: Rect
  } | undefined>(undefined)
  if (!imageUrl || !size) {
    return <div className="grid-preview-empty">{t('选择颜色大图后显示区域编辑画布')}</div>
  }

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = Math.round(((event.clientX - drag.startX) / drag.bounds.width) * size.width)
    const dy = Math.round(((event.clientY - drag.startY) / drag.bounds.height) * size.height)
    const original = drag.original
    let left = original.x
    let top = original.y
    let right = original.x + original.width
    let bottom = original.y + original.height

    if (drag.handle === 'move') {
      left = Math.max(0, Math.min(size.width - original.width, original.x + dx))
      top = Math.max(0, Math.min(size.height - original.height, original.y + dy))
      right = left + original.width
      bottom = top + original.height
    } else {
      if (drag.handle.includes('w')) left = Math.max(0, Math.min(right - 1, original.x + dx))
      if (drag.handle.includes('e')) right = Math.min(size.width, Math.max(left + 1, original.x + original.width + dx))
      if (drag.handle.includes('n')) top = Math.max(0, Math.min(bottom - 1, original.y + dy))
      if (drag.handle.includes('s')) bottom = Math.min(size.height, Math.max(top + 1, original.y + original.height + dy))
    }

    const next = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
    onChange(regions.map((rect, index) => (index === drag.index ? next : rect)))
  }

  return (
    <div
      className="region-editor-canvas"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
      onPointerMove={updateFromPointer}
      onPointerUp={() => { dragRef.current = undefined }}
      onPointerCancel={() => { dragRef.current = undefined }}
    >
      <img src={imageUrl} alt={t('不规则区域编辑')} draggable={false} />
      {regions.map((rect, index) => (
        <div
          className={`region-editor-box ${selectedIndex === index ? 'is-selected' : ''}`}
          key={`${rect.x}:${rect.y}:${rect.width}:${rect.height}:${index}`}
          style={{
            left: `${(rect.x / size.width) * 100}%`,
            top: `${(rect.y / size.height) * 100}%`,
            width: `${(rect.width / size.width) * 100}%`,
            height: `${(rect.height / size.height) * 100}%`,
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelect(index)
            const target = event.target as HTMLElement
            const handle = target.dataset.handle ?? 'move'
            dragRef.current = {
              index,
              handle,
              startX: event.clientX,
              startY: event.clientY,
              bounds: event.currentTarget.parentElement!.getBoundingClientRect(),
              original: rect,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
        >
          <span className="region-editor-number">{index + 1}</span>
          {selectedIndex === index && ['nw', 'ne', 'sw', 'se'].map((handle) => (
            <span
              key={handle}
              className={`region-resize-handle handle-${handle}`}
              data-handle={handle}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function RegionImportWorkspace({
  colorFile,
  normalFile,
  colorSize,
  normalSize,
  config,
  onChange,
  onError,
}: RegionImportWorkspaceProps) {
  const imageUrl = useObjectUrl(colorFile)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [detecting, setDetecting] = useState(false)
  const [detectionProgress, setDetectionProgress] = useState(0)
  const detectionController = useRef<AbortController | undefined>(undefined)
  const lastDetectedFile = useRef<File | undefined>(undefined)

  const updateConfig = (patch: Partial<RegionImportConfig>) => {
    onChange({ ...config, ...patch })
  }

  const cancelDetection = useCallback(() => {
    detectionController.current?.abort()
    detectionController.current = undefined
    setDetecting(false)
    setDetectionProgress(0)
  }, [])

  const runDetection = useCallback(async (options: RegionImportConfig = config) => {
    if (!colorFile) return
    detectionController.current?.abort()
    const controller = new AbortController()
    detectionController.current = controller
    setDetecting(true)
    setDetectionProgress(0)
    onError(undefined)
    try {
      const data = await readRegionImageData(colorFile)
      const regions = await detectRegionsFromImageDataAsync(
        data,
        {
          alphaThreshold: options.alphaThreshold,
          backgroundMode: options.backgroundMode,
          backgroundColor: options.backgroundColor,
          colorTolerance: options.colorTolerance,
          minRegionWidth: options.minRegionWidth,
          minRegionHeight: options.minRegionHeight,
          mergeDistance: options.mergeDistance,
          padding: options.padding,
        },
        controller.signal,
        (progress) => setDetectionProgress(progress.progress),
      )
      if (controller.signal.aborted) return
      onChange({ ...options, regions: sortRegionRectangles(regions, options.frameOrder) })
      setSelectedIndex(0)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      onError(error instanceof Error ? error.message : '自动区域检测失败。')
    } finally {
      if (detectionController.current === controller) {
        detectionController.current = undefined
        setDetecting(false)
        setDetectionProgress(0)
      }
    }
  }, [colorFile, config, onChange, onError])

  useEffect(() => {
    if (!colorFile || (lastDetectedFile.current === colorFile && config.regions.length > 0)) return
    lastDetectedFile.current = colorFile
    void runDetection(config)
  }, [colorFile, config, runDetection])

  useEffect(() => () => detectionController.current?.abort(), [])
  const current = config.regions[selectedIndex]
  const warnings = colorSize
    ? validateRegionConfig(config, colorSize, normalSize)
    : []

  const updateRegion = (patch: Partial<Rect>) => {
    if (!current || !colorSize) return
    const x = Math.min(colorSize.width - 1, Math.max(0, Math.round(patch.x ?? current.x)))
    const y = Math.min(colorSize.height - 1, Math.max(0, Math.round(patch.y ?? current.y)))
    const width = Math.min(colorSize.width - x, Math.max(1, Math.round(patch.width ?? current.width)))
    const height = Math.min(colorSize.height - y, Math.max(1, Math.round(patch.height ?? current.height)))
    const next = { x, y, width, height }
    const regions = config.regions.map((rect, index) => index === selectedIndex ? next : rect)
    onChange({ ...config, regions })
  }
  const addRegion = () => {
    if (!colorSize) return
    const width = Math.min(64, colorSize.width)
    const height = Math.min(64, colorSize.height)
    const region = {
      x: Math.floor((colorSize.width - width) / 2),
      y: Math.floor((colorSize.height - height) / 2),
      width,
      height,
    }
    const regions = [...config.regions, region]
    setSelectedIndex(regions.length - 1)
    onChange({ ...config, regions })
  }

  const removeRegion = () => {
    if (!current) return
    const regions = config.regions.filter((_, index) => index !== selectedIndex)
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, regions.length - 1)))
    onChange({ ...config, regions })
  }

  const mergeWithNext = () => {
    if (!current || selectedIndex >= config.regions.length - 1) return
    const next = config.regions[selectedIndex + 1]
    const x = Math.min(current.x, next.x)
    const y = Math.min(current.y, next.y)
    const merged = {
      x,
      y,
      width: Math.max(current.x + current.width, next.x + next.width) - x,
      height: Math.max(current.y + current.height, next.y + next.height) - y,
    }
    const regions = config.regions
      .filter((_, index) => index !== selectedIndex && index !== selectedIndex + 1)
    regions.splice(selectedIndex, 0, merged)
    onChange({ ...config, regions })
  }

  const sortRegions = () => {
    onChange({
      ...config,
      regions: sortRegionRectangles(config.regions, config.frameOrder),
    })
  }
  return (
    <div className="region-import-workspace">
      <aside className="region-import-settings">
        <section className="inspector-section">
          <div className="section-title-row">
            <strong>{t('自动检测参数')}</strong>
            <button type="button" className="mini-button" onClick={() => detecting ? cancelDetection() : void runDetection()}>
              {detecting ? t('取消检测 {percent}%', { percent: Math.round(detectionProgress * 100) }) : t('重新检测')}
            </button>
          </div>
          <p className="field-help">{t('自动检测最多处理 1600 万像素；超大图片会提示改用手动区域。')}</p>
          <RangeField
            label={t('透明阈值')}
            min={0}
            max={254}
            value={config.alphaThreshold}
            onChange={(alphaThreshold) => updateConfig({ alphaThreshold })}
          />
          <label className="field">
            <span>{t('背景识别')}</span>
            <select
              value={config.backgroundMode}
              onChange={(event) =>
                updateConfig({
                  backgroundMode: event.target.value as RegionImportConfig['backgroundMode'],
                })
              }
            >
              <option value="transparent">{t('透明背景')}</option>
              <option value="color">{t('纯色背景')}</option>
            </select>
          </label>
          {config.backgroundMode === 'color' && (
            <>
              <label className="field">
                <span>{t('背景色')}</span>
                <input
                  type="color"
                  value={config.backgroundColor}
                  onChange={(event) => updateConfig({ backgroundColor: event.target.value })}
                />
              </label>
              <RangeField
                label={t('颜色容差')}
                min={0}
                max={255}
                value={config.colorTolerance}
                onChange={(colorTolerance) => updateConfig({ colorTolerance })}
              />
            </>
          )}
          <div className="grid-number-grid">
            <NumberField label={t('最小宽度')} value={config.minRegionWidth} min={1} onChange={(minRegionWidth) => updateConfig({ minRegionWidth })} />
            <NumberField label={t('最小高度')} value={config.minRegionHeight} min={1} onChange={(minRegionHeight) => updateConfig({ minRegionHeight })} />
            <NumberField label={t('合并距离')} value={config.mergeDistance} min={0} onChange={(mergeDistance) => updateConfig({ mergeDistance })} />
            <NumberField label={t('外扩边距')} value={config.padding} min={0} onChange={(padding) => updateConfig({ padding })} />
          </div>
          <label className="field">
            <span>{t('排序方式')}</span>
            <select
              value={config.frameOrder}
              onChange={(event) => updateConfig({ frameOrder: event.target.value as RegionImportConfig['frameOrder'] })}
            >
              <option value="row-major">{t('从左到右，再换下一行')}</option>
              <option value="column-major">{t('从上到下，再换下一列')}</option>
            </select>
          </label>
        </section>

        <section className="inspector-section">
          <strong>{t('手动调整')}</strong>
          <div className="region-action-grid">
            <button type="button" className="mini-button" onClick={addRegion}>{t('新增区域')}</button>
            <button type="button" className="mini-button" disabled={!current} onClick={removeRegion}>{t('删除区域')}</button>
            <button type="button" className="mini-button" disabled={selectedIndex >= config.regions.length - 1} onClick={mergeWithNext}>{t('合并下一帧')}</button>
            <button type="button" className="mini-button" onClick={sortRegions}>{t('按顺序排序')}</button>
          </div>
          {current && (
            <div className="grid-number-grid region-number-grid">
              <NumberField label="X" max={colorSize ? colorSize.width - 1 : undefined} value={current.x} onChange={(x) => updateRegion({ x })} />
              <NumberField label="Y" max={colorSize ? colorSize.height - 1 : undefined} value={current.y} onChange={(y) => updateRegion({ y })} />
              <NumberField label={t('宽度')} min={1} max={colorSize ? colorSize.width - current.x : undefined} value={current.width} onChange={(width) => updateRegion({ width })} />
              <NumberField label={t('高度')} min={1} max={colorSize ? colorSize.height - current.y : undefined} value={current.height} onChange={(height) => updateRegion({ height })} />
            </div>
          )}
        </section>
      </aside>

      <section className="region-import-editor">
        <div className="grid-preview-heading">
          <strong>{t('不规则区域编辑')}</strong>
          <span>{colorSize ? `${colorSize.width}×${colorSize.height}` : t('尺寸未知')} · {t('{count} 帧', { count: config.regions.length })} · {normalFile ? t('法线图同步区域') : t('平坦法线')}</span>
        </div>
        <RegionEditor
          imageUrl={imageUrl}
          size={colorSize}
          regions={config.regions}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onChange={(regions) => onChange({ ...config, regions })}
        />
      </section>

      <aside className="region-import-list">
        <div className="grid-preview-heading">
          <strong>{t('区域列表')}</strong>
          <span>{t('{count} 个', { count: config.regions.length })}</span>
        </div>
        <div className="region-list-scroll">
          {config.regions.map((region, index) => (
            <button
              type="button"
              key={`${region.x}:${region.y}:${region.width}:${region.height}:${index}`}
              className={`region-list-item ${selectedIndex === index ? 'is-active' : ''}`}
              onClick={() => setSelectedIndex(index)}
            >
              <strong>#{index + 1}</strong>
              <span>X{region.x} Y{region.y}</span>
              <span>{region.width}×{region.height}</span>
            </button>
          ))}
        </div>
        <div className="region-rule-note">
          <strong>{t('法线图同步')}</strong>
          <p>{t('颜色图确认的区域矩形会原样应用到同尺寸法线图，不需要重新检测法线图。')}</p>
        </div>
        {warnings.map((warning, index) => (
          <div className="warning-card warning-error" key={`${warning.code}:${index}`}>
            <strong>{t('阻止导入')}</strong>
            <span>{warning.message}</span>
          </div>
        ))}
      </aside>
    </div>
  )
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}</output>
    </label>
  )
}
