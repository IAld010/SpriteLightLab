import { useEffect, useRef, useState } from 'react'
import { normalizeHex, parsePaletteFile, serializeGpl, serializeHexPalette } from '../domain/palette'
import { useEditorStore } from '../store/editorStore'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'
import { downloadText } from '../utils/download'
import { t } from '../i18n'

export function PalettePanel() {
  const importInput = useRef<HTMLInputElement>(null)
  const palettePickerRef = useRef<HTMLDivElement>(null)
  const paletteTriggerRef = useRef<HTMLButtonElement>(null)
  const paletteOptionRefs = useRef(new Map<string, HTMLButtonElement>())
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false)
  const [focusedPaletteId, setFocusedPaletteId] = useState<string>()
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

  useEffect(() => {
    if (!paletteMenuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!palettePickerRef.current?.contains(event.target as Node)) {
        setPaletteMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeOnPointerDown)
    return () => window.removeEventListener('pointerdown', closeOnPointerDown)
  }, [paletteMenuOpen])

  useEffect(() => {
    if (!paletteMenuOpen || !focusedPaletteId) return
    paletteOptionRefs.current.get(focusedPaletteId)?.focus()
  }, [focusedPaletteId, paletteMenuOpen])

  if (!bundle || !palette) {
    return <div className="empty-list">{t('导入素材后启用 Palette Swap。')}</div>
  }

  const exportColors = palette.entries.map((entry) => entry.target)
  const openPaletteMenu = () => {
    setFocusedPaletteId(activePaletteId)
    setPaletteMenuOpen(true)
  }
  const movePaletteFocus = (direction: number) => {
    const focusedIndex = Math.max(
      0,
      palettePresets.findIndex((preset) => preset.id === focusedPaletteId),
    )
    const targetIndex = (focusedIndex + direction + palettePresets.length) % palettePresets.length
    setFocusedPaletteId(palettePresets[targetIndex]?.id ?? activePaletteId)
  }
  const choosePalette = (paletteId: string) => {
    setActivePalette(paletteId)
    setPaletteMenuOpen(false)
    window.requestAnimationFrame(() => paletteTriggerRef.current?.focus())
  }

  return (
    <div className="inspector-content palette-panel">
      <section className="inspector-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Palette Swap</div>
            <strong className="panel-title">
              {bundle.paletteMode === 'indexed' ? t('索引色精确换色') : t('全彩替换与调色')}
            </strong>
          </div>
          <span className={`mode-badge mode-${bundle.paletteMode}`}>
            {bundle.paletteMode === 'indexed'
              ? t('{count} 色', { count: bundle.paletteSources.length })
              : t('全彩')}
          </span>
        </div>
        <div className="palette-toolbar">
          <div className="palette-picker" ref={palettePickerRef}>
            <button
              ref={paletteTriggerRef}
              type="button"
              className={`palette-picker-trigger ${paletteMenuOpen ? 'is-open' : ''}`}
              aria-label={t('当前色板：{name}', { name: palette.name })}
              aria-haspopup="listbox"
              aria-expanded={paletteMenuOpen}
              aria-controls="palette-picker-listbox"
              data-testid="palette-picker-trigger"
              onClick={() => {
                if (paletteMenuOpen) {
                  setPaletteMenuOpen(false)
                } else {
                  openPaletteMenu()
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  openPaletteMenu()
                }
              }}
            >
              <span>{palette.name}</span>
              <span className="palette-picker-chevron" aria-hidden="true">⌄</span>
            </button>
            {paletteMenuOpen && (
              <div
                id="palette-picker-listbox"
                className="palette-picker-menu"
                role="listbox"
                aria-label={t('色板列表')}
                data-testid="palette-picker-menu"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    movePaletteFocus(event.key === 'ArrowDown' ? 1 : -1)
                  } else if (event.key === 'Home') {
                    event.preventDefault()
                    setFocusedPaletteId(palettePresets[0]?.id)
                  } else if (event.key === 'End') {
                    event.preventDefault()
                    setFocusedPaletteId(palettePresets.at(-1)?.id)
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (focusedPaletteId) choosePalette(focusedPaletteId)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setPaletteMenuOpen(false)
                    paletteTriggerRef.current?.focus()
                  } else if (event.key === 'Tab') {
                    setPaletteMenuOpen(false)
                  }
                }}
              >
                {palettePresets.map((preset) => {
                  const selected = preset.id === activePaletteId
                  return (
                    <button
                      key={preset.id}
                      ref={(element) => {
                        if (element) paletteOptionRefs.current.set(preset.id, element)
                        else paletteOptionRefs.current.delete(preset.id)
                      }}
                      type="button"
                      className={`palette-picker-option ${selected ? 'is-selected' : ''}`}
                      role="option"
                      aria-selected={selected}
                      tabIndex={preset.id === focusedPaletteId ? 0 : -1}
                      onFocus={() => setFocusedPaletteId(preset.id)}
                      onClick={() => choosePalette(preset.id)}
                    >
                      <span className="palette-picker-option-name">{preset.name}</span>
                      {selected && <span className="palette-picker-option-state">{t('当前')}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button type="button" className="mini-button" onClick={() => addPalette()}>
            +
          </button>
          <button
            type="button"
            className="mini-button"
            onClick={() => duplicatePalette(palette.id)}
          >
            {t('复制')}
          </button>
          <button
            type="button"
            className="mini-button danger"
            disabled={palettePresets.length <= 1}
            onClick={() => deletePalette(palette.id)}
          >
            {t('删除')}
          </button>
        </div>
        <input
          key={`${palette.id}:${palette.name}`}
          className="palette-name-input"
          defaultValue={palette.name}
          onBlur={(event) => {
            const nextName = event.currentTarget.value.trim()
            if (nextName && nextName !== palette.name) {
              renamePalette(palette.id, nextName)
            } else if (!nextName) {
              event.currentTarget.value = palette.name
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          aria-label={t('色板名称')}
        />
        <div className="history-row">
          <button type="button" className="mini-button" disabled={pastLength === 0} onClick={undo}>
            {t('撤销')}
          </button>
          <button type="button" className="mini-button" disabled={futureLength === 0} onClick={redo}>
            {t('重做')}
          </button>
          <button type="button" className="mini-button" onClick={resetPaletteEntries}>
            {t('重置')}
          </button>
        </div>
      </section>

      {bundle.paletteMode === 'indexed' ? (
        <section className="inspector-section">
          <div className="section-title-row">
            <strong>{t('源色 → 目标色')}</strong>
            <span>{t('{count} 项', { count: palette.entries.length })}</span>
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
                  aria-label={t('{color} 目标色', { color: entry.source })}
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
            <strong>{t('拾色替换规则')}</strong>
            <button type="button" className="mini-button" onClick={addColorRule}>
              + {t('新规则')}
            </button>
          </div>
          <div className="rule-list">
            {palette.rules.length === 0 && (
              <div className="empty-inline">{t('添加规则后可按颜色与容差替换渐变或抗锯齿像素。')}</div>
            )}
            {palette.rules.map((rule) => (
              <div className="color-rule" key={rule.id}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  aria-label={t('启用规则')}
                  onChange={(event) => updateColorRule(rule.id, { enabled: event.target.checked })}
                />
                <input
                  type="color"
                  value={rule.source}
                  aria-label={t('规则源色')}
                  onChange={(event) => updateColorRule(rule.id, { source: event.target.value })}
                />
                <span>→</span>
                <input
                  type="color"
                  value={rule.target}
                  aria-label={t('规则目标色')}
                  onChange={(event) => updateColorRule(rule.id, { target: event.target.value })}
                />
                <input
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  value={rule.tolerance}
                  aria-label={t('颜色容差')}
                  onChange={(event) =>
                    updateColorRule(rule.id, { tolerance: Number(event.target.value) })
                  }
                />
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => removeColorRule(rule.id)}
                  aria-label={t('删除颜色规则')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="inspector-section">
        <strong>{t('全局调色')}</strong>
        <div className="range-grid">
          <RangeField
            label={t('色相')}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={palette.adjustments.hue / 360}
            onChange={(value) => updateAdjustments({ hue: value * 360 })}
          />
          <RangeField
            label={t('饱和度')}
            min={0}
            max={2}
            step={0.01}
            value={palette.adjustments.saturation}
            onChange={(saturation) => updateAdjustments({ saturation })}
          />
          <RangeField
            label={t('亮度')}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={palette.adjustments.lightness}
            onChange={(lightness) => updateAdjustments({ lightness })}
          />
          <RangeField
            label={t('对比度')}
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
            aria-label={t('染色')}
            onChange={(event) => updateAdjustments({ tint: event.target.value })}
          />
          <span>{t('整体染色')}</span>
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
          <strong>{t('色板交换')}</strong>
          <button type="button" className="mini-button" onClick={() => importInput.current?.click()}>
            {t('导入')}
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
            {t('导出 GPL')}
          </button>
          <button
            type="button"
            className="mini-button"
            disabled={exportColors.length === 0}
            onClick={() =>
              downloadText(serializeHexPalette(exportColors), `${palette.name}.hex`)
            }
          >
            {t('导出 HEX')}
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
