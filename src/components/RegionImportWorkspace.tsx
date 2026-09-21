import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectRegionsFromImageData,
  readRegionImageData,
  validateRegionConfig,
} from '../domain/regionImport'
import type { RegionImportConfig, Rect } from '../domain/types'

interface RegionImportWorkspaceProps {
  colorFile?: File
  normalFile?: File
  colorSize?: { width: number; height: number }
  normalSize?: { width: number; height: number }
  config: RegionImportConfig
  onChange: (config: RegionImportConfig) => void
  onError: (message?: string) => void
}

const objectUrlCache = new WeakMap<File, string>()
const objectUrls = new Set<string>()

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
  })
}

function useObjectUrl(file?: File): string | undefined {
  if (!file) return undefined
  const cached = objectUrlCache.get(file)
  if (cached) return cached
  const url = URL.createObjectURL(file)
  objectUrlCache.set(file, url)
  objectUrls.add(url)
  return url
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
        onChange={(event) => onChange(Number(event.target.value))}
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
    return <div className="grid-preview-empty">选择颜色大图后显示区域编辑画布</div>
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
      if (drag.handle.includes('w')) left = Math.max(0, original.x + dx)
      if (drag.handle.includes('e')) right = Math.min(size.width, original.x + original.width + dx)
      if (drag.handle.includes('n')) top = Math.max(0, original.y + dy)
      if (drag.handle.includes('s')) bottom = Math.min(size.height, original.y + original.height + dy)
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
      <img src={imageUrl} alt="不规则区域编辑" draggable={false} />
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
  const lastDetectedFile = useRef<string | undefined>(undefined)

  const updateConfig = (patch: Partial<RegionImportConfig>) => {
    onChange({ ...config, ...patch })
  }

  const runDetection = useCallback(async (options: RegionImportConfig = config) => {
    if (!colorFile) return
    setDetecting(true)
    onError(undefined)
    try {
      const data = await readRegionImageData(colorFile)
      const regions = detectRegionsFromImageData(data, {
        alphaThreshold: options.alphaThreshold,
        backgroundMode: options.backgroundMode,
        backgroundColor: options.backgroundColor,
        colorTolerance: options.colorTolerance,
        minRegionWidth: options.minRegionWidth,
        minRegionHeight: options.minRegionHeight,
        mergeDistance: options.mergeDistance,
        padding: options.padding,
      })
      const sortedRegions = options.frameOrder === 'column-major'
        ? [...regions].sort((left, right) => left.x === right.x ? left.y - right.y : left.x - right.x)
        : regions
      onChange({ ...options, mode: 'auto', regions: sortedRegions })
      setSelectedIndex(0)
    } catch (error) {
      onError(error instanceof Error ? error.message : '自动区域检测失败。')
    } finally {
      setDetecting(false)
    }
  }, [colorFile, config, onChange, onError])

  useEffect(() => {
    if (!colorFile || config.regions.length > 0 || lastDetectedFile.current === colorFile.name) return
    lastDetectedFile.current = colorFile.name
    void runDetection(config)
  }, [colorFile, config, runDetection])

  const current = config.regions[selectedIndex]
  const warnings = colorSize
    ? validateRegionConfig(config, colorSize, normalSize)
    : []

  const updateRegion = (patch: Partial<Rect>) => {
    if (!current || !colorSize) return
    const next = {
      x: Math.max(0, Math.round(patch.x ?? current.x)),
      y: Math.max(0, Math.round(patch.y ?? current.y)),
      width: Math.max(1, Math.round(patch.width ?? current.width)),
      height: Math.max(1, Math.round(patch.height ?? current.height)),
    }
    next.width = Math.min(next.width, colorSize.width - next.x)
    next.height = Math.min(next.height, colorSize.height - next.y)
    const regions = config.regions.map((rect, index) => index === selectedIndex ? next : rect)
    onChange({ ...config, mode: 'manual', regions })
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
    onChange({ ...config, mode: 'manual', regions })
  }

  const removeRegion = () => {
    if (!current) return
    const regions = config.regions.filter((_, index) => index !== selectedIndex)
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, regions.length - 1)))
    onChange({ ...config, mode: 'manual', regions })
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
    onChange({ ...config, mode: 'manual', regions })
  }

  const sortRegions = () => {
    const regions = config.frameOrder === 'column-major'
      ? [...config.regions].sort((left, right) => left.x === right.x ? left.y - right.y : left.x - right.x)
      : [...config.regions].sort((left, right) => left.y === right.y ? left.x - right.x : left.y - right.y)
    onChange({ ...config, regions })
  }

  return (
    <div className="region-import-workspace">
      <aside className="region-import-settings">
        <section className="inspector-section">
          <div className="section-title-row">
            <strong>自动检测参数</strong>
            <button type="button" className="mini-button" onClick={() => void runDetection()}>
              {detecting ? '检测中…' : '重新检测'}
            </button>
          </div>
          <RangeField
            label="透明阈值"
            min={0}
            max={254}
            value={config.alphaThreshold}
            onChange={(alphaThreshold) => updateConfig({ alphaThreshold, mode: 'auto' })}
          />
          <label className="field">
            <span>背景识别</span>
            <select
              value={config.backgroundMode}
              onChange={(event) =>
                updateConfig({
                  backgroundMode: event.target.value as RegionImportConfig['backgroundMode'],
                  mode: 'auto',
                })
              }
            >
              <option value="transparent">透明背景</option>
              <option value="color">纯色背景</option>
            </select>
          </label>
          {config.backgroundMode === 'color' && (
            <>
              <label className="field">
                <span>背景色</span>
                <input
                  type="color"
                  value={config.backgroundColor}
                  onChange={(event) => updateConfig({ backgroundColor: event.target.value, mode: 'auto' })}
                />
              </label>
              <RangeField
                label="颜色容差"
                min={0}
                max={255}
                value={config.colorTolerance}
                onChange={(colorTolerance) => updateConfig({ colorTolerance, mode: 'auto' })}
              />
            </>
          )}
          <div className="grid-number-grid">
            <NumberField label="最小宽度" value={config.minRegionWidth} min={1} onChange={(minRegionWidth) => updateConfig({ minRegionWidth, mode: 'auto' })} />
            <NumberField label="最小高度" value={config.minRegionHeight} min={1} onChange={(minRegionHeight) => updateConfig({ minRegionHeight, mode: 'auto' })} />
            <NumberField label="合并距离" value={config.mergeDistance} min={0} onChange={(mergeDistance) => updateConfig({ mergeDistance, mode: 'auto' })} />
            <NumberField label="外扩边距" value={config.padding} min={0} onChange={(padding) => updateConfig({ padding, mode: 'auto' })} />
          </div>
          <label className="field">
            <span>排序方式</span>
            <select
              value={config.frameOrder}
              onChange={(event) => updateConfig({ frameOrder: event.target.value as RegionImportConfig['frameOrder'] })}
            >
              <option value="row-major">从左到右，再换下一行</option>
              <option value="column-major">从上到下，再换下一列</option>
            </select>
          </label>
        </section>

        <section className="inspector-section">
          <strong>手动调整</strong>
          <div className="region-action-grid">
            <button type="button" className="mini-button" onClick={addRegion}>新增区域</button>
            <button type="button" className="mini-button" disabled={!current} onClick={removeRegion}>删除区域</button>
            <button type="button" className="mini-button" disabled={selectedIndex >= config.regions.length - 1} onClick={mergeWithNext}>合并下一帧</button>
            <button type="button" className="mini-button" onClick={sortRegions}>按顺序排序</button>
          </div>
          {current && (
            <div className="grid-number-grid region-number-grid">
              <NumberField label="X" value={current.x} onChange={(x) => updateRegion({ x })} />
              <NumberField label="Y" value={current.y} onChange={(y) => updateRegion({ y })} />
              <NumberField label="宽度" value={current.width} min={1} onChange={(width) => updateRegion({ width })} />
              <NumberField label="高度" value={current.height} min={1} onChange={(height) => updateRegion({ height })} />
            </div>
          )}
        </section>
      </aside>

      <section className="region-import-editor">
        <div className="grid-preview-heading">
          <strong>不规则区域编辑</strong>
          <span>{colorSize ? `${colorSize.width}?${colorSize.height}` : '?????'} ? {config.regions.length} ? {normalFile ? '\u6cd5\u7ebf\u56fe\u540c\u6b65\u533a\u57df' : '\u5e73\u5766\u6cd5\u7ebf'}</span>
        </div>
        <RegionEditor
          imageUrl={imageUrl}
          size={colorSize}
          regions={config.regions}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onChange={(regions) => onChange({ ...config, mode: 'manual', regions })}
        />
      </section>

      <aside className="region-import-list">
        <div className="grid-preview-heading">
          <strong>区域列表</strong>
          <span>{config.regions.length} 个</span>
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
          <strong>法线图同步</strong>
          <p>颜色图确认的区域矩形会原样应用到同尺寸法线图，不需要重新检测法线图。</p>
        </div>
        {warnings.map((warning, index) => (
          <div className="warning-card warning-error" key={`${warning.code}:${index}`}>
            <strong>阻止导入</strong>
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
