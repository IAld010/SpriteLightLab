import { useRef } from 'react'
import { normalizeHex, parsePaletteFile, serializeGpl, serializeHexPalette } from '../domain/palette'
import { useEditorStore } from '../store/editorStore'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'
import { downloadText } from '../utils/download'

export function PalettePanel() {
  const importInput = useRef<HTMLInputElement>(null)
  const bundle = useEditorStore((state) => state.bundle)
  const palette = useProjectStore((state) => activePaletteFromState(state))
  const palettePresets = useProjectStore((state) => state.palettePresets)
  const activePaletteId = useProjectStore((state) => state.activePaletteId)
  const pastLength = useProjectStore((state) => state.past.length)
  const futureLength = useProjectStore((state) => state.future.length)
  const setActivePalette = useProjectStore((state) => state.setActivePalette)
  const addPalette = useProjectStore((state) => state.addPalette)
  const duplicatePalette = useProjectStore((state) => state.duplicatePalette)
  const deletePalette = useProjectStore((state) => state.deletePalette)
  const renamePalette = useProjectStore((state) => state.renamePalette)
  const updatePaletteEntry = useProjectStore((state) => state.updatePaletteEntry)
  const resetPaletteEntries = useProjectStore((state) => state.resetPaletteEntries)
  const importPaletteColors = useProjectStore((state) => state.importPaletteColors)
  const addColorRule = useProjectStore((state) => state.addColorRule)
  const updateColorRule = useProjectStore((state) => state.updateColorRule)
  const removeColorRule = useProjectStore((state) => state.removeColorRule)
  const updateAdjustments = useProjectStore((state) => state.updateAdjustments)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)

  if (!bundle || !palette) {
    return <div className="empty-list">导入素材后启用 Palette Swap。</div>
  }

  const exportColors = palette.entries.map((entry) => entry.target)

  return (
    <div className="inspector-content palette-panel">
      <section className="inspector-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Palette Swap</div>
            <strong className="panel-title">
              {bundle.paletteMode === 'indexed' ? '索引色精确换色' : '全彩替换与调色'}
            </strong>
          </div>
          <span className={`mode-badge mode-${bundle.paletteMode}`}>
            {bundle.paletteMode === 'indexed'
              ? `${bundle.paletteSources.length} 色`
              : '全彩'}
          </span>
        </div>
        <div className="palette-toolbar">
          <select
            value={activePaletteId}
            onChange={(event) => setActivePalette(event.target.value)}
            aria-label="当前色板"
          >
            {palettePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button type="button" className="mini-button" onClick={() => addPalette()}>
            +
          </button>
          <button
            type="button"
            className="mini-button"
            onClick={() => duplicatePalette(palette.id)}
          >
            复制
          </button>
          <button
            type="button"
            className="mini-button danger"
            disabled={palettePresets.length <= 1}
            onClick={() => deletePalette(palette.id)}
          >
            删除
          </button>
        </div>
        <input
          className="palette-name-input"
          value={palette.name}
          onChange={(event) => renamePalette(palette.id, event.target.value)}
          aria-label="色板名称"
        />
        <div className="history-row">
          <button type="button" className="mini-button" disabled={pastLength === 0} onClick={undo}>
            撤销
          </button>
          <button type="button" className="mini-button" disabled={futureLength === 0} onClick={redo}>
            重做
          </button>
          <button type="button" className="mini-button" onClick={resetPaletteEntries}>
            重置
          </button>
        </div>
      </section>

      {bundle.paletteMode === 'indexed' ? (
        <section className="inspector-section">
          <div className="section-title-row">
            <strong>源色 → 目标色</strong>
            <span>{palette.entries.length} 项</span>
          </div>
          <div className="swatch-list">
            {palette.entries.map((entry) => (
              <label className="swatch-row" key={entry.source}>
                <span className="swatch-index">
                  {String(bundle.paletteSources.indexOf(entry.source)).padStart(2, '0')}
                </span>
                <span className="color-chip" style={{ background: entry.source }} />
                <code>{entry.source}</code>
                <span className="swatch-arrow">→</span>
                <input
                  type="color"
                  value={entry.target}
                  aria-label={`${entry.source} 目标色`}
                  onChange={(event) =>
                    updatePaletteEntry(entry.source, normalizeHex(event.target.value))
                  }
                />
                <code>{entry.target}</code>
              </label>
            ))}
          </div>
        </section>
      ) : (
        <section className="inspector-section">
          <div className="section-title-row">
            <strong>拾色替换规则</strong>
            <button type="button" className="mini-button" onClick={addColorRule}>
              + 新规则
            </button>
          </div>
          <div className="rule-list">
            {palette.rules.length === 0 && (
              <div className="empty-inline">添加规则后可按颜色与容差替换渐变或抗锯齿像素。</div>
            )}
            {palette.rules.map((rule) => (
              <div className="color-rule" key={rule.id}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  aria-label="启用规则"
                  onChange={(event) => updateColorRule(rule.id, { enabled: event.target.checked })}
                />
                <input
                  type="color"
                  value={rule.source}
                  aria-label="规则源色"
                  onChange={(event) => updateColorRule(rule.id, { source: event.target.value })}
                />
                <span>→</span>
                <input
                  type="color"
                  value={rule.target}
                  aria-label="规则目标色"
                  onChange={(event) => updateColorRule(rule.id, { target: event.target.value })}
                />
                <input
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  value={rule.tolerance}
                  aria-label="颜色容差"
                  onChange={(event) =>
                    updateColorRule(rule.id, { tolerance: Number(event.target.value) })
                  }
                />
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => removeColorRule(rule.id)}
                  aria-label="删除颜色规则"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="inspector-section">
        <strong>全局调色</strong>
        <div className="range-grid">
          <RangeField
            label="色相"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={palette.adjustments.hue / 360}
            onChange={(value) => updateAdjustments({ hue: value * 360 })}
          />
          <RangeField
            label="饱和度"
            min={0}
            max={2}
            step={0.01}
            value={palette.adjustments.saturation}
            onChange={(saturation) => updateAdjustments({ saturation })}
          />
          <RangeField
            label="亮度"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={palette.adjustments.lightness}
            onChange={(lightness) => updateAdjustments({ lightness })}
          />
          <RangeField
            label="对比度"
            min={0}
            max={2}
            step={0.01}
            value={palette.adjustments.contrast}
            onChange={(contrast) => updateAdjustments({ contrast })}
          />
        </div>
        <div className="tint-row">
          <input
            type="color"
            value={palette.adjustments.tint}
            aria-label="染色"
            onChange={(event) => updateAdjustments({ tint: event.target.value })}
          />
          <span>整体染色</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={palette.adjustments.tintStrength}
            onChange={(event) =>
              updateAdjustments({ tintStrength: Number(event.target.value) })
            }
          />
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>色板交换</strong>
          <button type="button" className="mini-button" onClick={() => importInput.current?.click()}>
            导入
          </button>
        </div>
        <input
          ref={importInput}
          className="visually-hidden"
          type="file"
          accept=".gpl,.hex,text/plain"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (file) {
              importPaletteColors(parsePaletteFile(await file.text(), file.name), file.name)
            }
            event.target.value = ''
          }}
        />
        <div className="export-row">
          <button
            type="button"
            className="mini-button"
            disabled={exportColors.length === 0}
            onClick={() => downloadText(serializeGpl(exportColors, palette.name), `${palette.name}.gpl`)}
          >
            导出 GPL
          </button>
          <button
            type="button"
            className="mini-button"
            disabled={exportColors.length === 0}
            onClick={() =>
              downloadText(serializeHexPalette(exportColors), `${palette.name}.hex`)
            }
          >
            导出 HEX
          </button>
        </div>
      </section>
    </div>
  )
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
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
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value.toFixed(2)}</output>
    </label>
  )
}