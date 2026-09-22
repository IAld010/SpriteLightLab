import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import type { LightType } from '../domain/types'

export function LightingPanel() {
  const bundle = useEditorStore((state) => state.bundle)
  const background = useEditorStore((state) => state.settings.background)
  const setBackground = useEditorStore((state) => state.setBackground)
  const lighting = useProjectStore((state) => state.lighting)
  const preferences = useProjectStore((state) => state.renderPreferences)
  const updateAmbient = useProjectStore((state) => state.updateAmbient)
  const addLight = useProjectStore((state) => state.addLight)
  const updateLight = useProjectStore((state) => state.updateLight)
  const removeLight = useProjectStore((state) => state.removeLight)
  const selectLight = useProjectStore((state) => state.selectLight)
  const updateRenderPreferences = useProjectStore((state) => state.updateRenderPreferences)

  const selectedLight = lighting.lights.find((light) => light.id === lighting.selectedLightId)

  if (!bundle) {
    return <div className="empty-list">导入素材后启用法线光照。</div>
  }

  return (
    <div className="inspector-content lighting-panel">
      <section className="inspector-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">2D Lighting</div>
            <strong className="panel-title">法线光照工作台</strong>
          </div>
          <label className="switch-control">
            <input
              type="checkbox"
              checked={preferences.lightingEnabled}
              onChange={(event) =>
                updateRenderPreferences({ lightingEnabled: event.target.checked })
              }
            />
            <span>启用</span>
          </label>
        </div>
        <div className="range-grid">
          <RangeField
            label="法线强度"
            min={0}
            max={2}
            step={0.01}
            value={preferences.normalStrength}
            onChange={(normalStrength) => updateRenderPreferences({ normalStrength })}
          />
          <RangeField
            label="高光"
            min={0}
            max={1}
            step={0.01}
            value={preferences.specularEnabled ? preferences.specularStrength : 0}
            onChange={(specularStrength) =>
              updateRenderPreferences({
                specularEnabled: specularStrength > 0,
                specularStrength,
              })
            }
          />
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={preferences.flipGreen}
            onChange={(event) => updateRenderPreferences({ flipGreen: event.target.checked })}
          />
          翻转法线绿色通道（DirectX）
        </label>
      </section>

      <section className="inspector-section">
        <strong>环境光</strong>
        <div className="color-setting-row">
          <input
            type="color"
            value={lighting.ambientColor}
            aria-label="环境光颜色"
            onChange={(event) => updateAmbient({ ambientColor: event.target.value })}
          />
          <code>{lighting.ambientColor}</code>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={lighting.ambientIntensity}
            aria-label="环境光强度"
            onChange={(event) =>
              updateAmbient({ ambientIntensity: Number(event.target.value) })
            }
          />
          <output>{lighting.ambientIntensity.toFixed(2)}</output>
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>光源</strong>
          <span>{lighting.lights.length} / 32</span>
        </div>
        <div className="add-light-row">
          {(['directional', 'point', 'spot'] as LightType[]).map((type) => (
            <button
              type="button"
              className="mini-button"
              key={type}
              disabled={lighting.lights.length >= 32}
              onClick={() => addLight(type)}
            >
              + {type === 'directional' ? '方向光' : type === 'point' ? '点光' : '聚光'}
            </button>
          ))}
        </div>
        <div className="light-list">
          {lighting.lights.map((light) => (
            <div
              className={`light-row ${light.id === lighting.selectedLightId ? 'is-active' : ''}`}
              key={light.id}
            >
              <button type="button" className="light-main" onClick={() => selectLight(light.id)}>
                <span className="color-chip" style={{ background: light.color }} />
                <span>{light.name}</span>
                <small>{light.type === 'directional' ? '方向光' : light.type === 'point' ? '点光' : '聚光'}</small>
              </button>
              <div className="light-row-actions">
                <input
                  type="checkbox"
                  checked={light.enabled}
                  aria-label={`\u542f\u7528 ${light.name}`}
                  onChange={(event) => updateLight(light.id, { enabled: event.target.checked })}
                />

              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedLight && (
        <section className="inspector-section light-editor">
          <div className="section-title-row">
            <strong>编辑 {selectedLight.name}</strong>
            <button
              type="button"
              className="mini-button danger"
              onClick={() => removeLight(selectedLight.id)}
            >
              删除
            </button>
          </div>
          <div className="color-setting-row">
            <input
              type="color"
              value={selectedLight.color}
              aria-label="光源颜色"
              onChange={(event) => updateLight(selectedLight.id, { color: event.target.value })}
            />
            <code>{selectedLight.color}</code>
            <input
              type="range"
              min="0"
              max="3"
              step="0.01"
              value={selectedLight.intensity}
              aria-label="光源强度"
              onChange={(event) =>
                updateLight(selectedLight.id, { intensity: Number(event.target.value) })
              }
            />
            <output>{selectedLight.intensity.toFixed(2)}</output>
          </div>

          {selectedLight.type !== 'point' && (
            <RangeField
              label="方向角"
              min={0}
              max={360}
              step={1}
              value={selectedLight.direction}
              onChange={(direction) => updateLight(selectedLight.id, { direction })}
            />
          )}

          {selectedLight.type !== 'directional' && (
            <>
              <RangeField
                label="棋盘 X"
                min={0}
                max={1}
                step={0.005}
                value={selectedLight.x}
                onChange={(x) => updateLight(selectedLight.id, { x })}
              />
              <RangeField
                label="棋盘 Y"
                min={0}
                max={1}
                step={0.005}
                value={selectedLight.y}
                onChange={(y) => updateLight(selectedLight.id, { y })}
              />
              <RangeField
                label="作用半径"
                min={0.05}
                max={2}
                step={0.01}
                value={selectedLight.radius}
                onChange={(radius) => updateLight(selectedLight.id, { radius })}
              />
              <RangeField
                label="二次衰减"
                min={0.1}
                max={40}
                step={0.1}
                value={selectedLight.falloff}
                onChange={(falloff) => updateLight(selectedLight.id, { falloff })}
              />
            </>
          )}

          {selectedLight.type === 'spot' && (
            <>
              <RangeField
                label="聚光角度"
                min={1}
                max={179}
                step={1}
                value={selectedLight.coneAngle}
                onChange={(coneAngle) => updateLight(selectedLight.id, { coneAngle })}
              />
              <RangeField
                label="边缘柔化"
                min={0}
                max={1}
                step={0.01}
                value={selectedLight.softness}
                onChange={(softness) => updateLight(selectedLight.id, { softness })}
              />
            </>
          )}
        </section>
      )}

      <section className="inspector-section">
        <strong>预览背景</strong>
        <div className="segmented full-width">
          {(['checker', 'dark', 'light'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={background === value ? 'is-active' : ''}
              onClick={() => setBackground(value)}
            >
              {value === 'checker' ? '棋盘' : value === 'dark' ? '深色' : '浅色'}
            </button>
          ))}
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