import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { resolveFrameAlignment } from '../domain/alignment'

function imageSize(
  bundle: NonNullable<ReturnType<typeof useEditorStore.getState>['bundle']>,
  frameId: string,
): { width: number; height: number } {
  const frame = bundle.frames.find((candidate) => candidate.id === frameId)
  if (!frame) return { width: 1, height: 1 }
  const image = bundle.images.find((candidate) => candidate.id === frame.source.imageId)
  return {
    width: frame.source.rect?.width ?? image?.width ?? 1,
    height: frame.source.rect?.height ?? image?.height ?? 1,
  }
}

export function AnchorCalibrationPanel() {
  const bundle = useEditorStore((state) => state.bundle)
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const action = useEditorStore((state) => getSelectedAction(state))
  const enabled = useEditorStore((state) => state.anchorCalibrationEnabled)
  const zoom = useEditorStore((state) => state.anchorCalibrationZoom)
  const gridVisible = useEditorStore((state) => state.anchorGridVisible)
  const onionSkin = useEditorStore((state) => state.anchorOnionSkin)
  const snapMode = useEditorStore((state) => state.anchorSnapMode)
  const setEnabled = useEditorStore((state) => state.setAnchorCalibrationEnabled)
  const setZoom = useEditorStore((state) => state.setAnchorCalibrationZoom)
  const setGridVisible = useEditorStore((state) => state.setAnchorGridVisible)
  const setOnionSkin = useEditorStore((state) => state.setAnchorOnionSkin)
  const setSnapMode = useEditorStore((state) => state.setAnchorSnapMode)
  const updateFrameAlignment = useEditorStore((state) => state.updateFrameAlignment)
  const updateActionAlignment = useEditorStore((state) => state.updateActionAlignment)
  const applyPresetToAll = useEditorStore((state) => state.applyAnchorPresetToAll)

  if (!bundle || !currentFrame || !action) {
    return <div className="empty-list">导入素材后启用锚点校准。</div>
  }

  const size = imageSize(bundle, currentFrame.id)
  const alignment =
    currentFrame.alignment ?? resolveFrameAlignment(size.width, size.height, 'bottom-center')
  const actionAlignment = action.alignment

  const updateNumber = (
    key: 'pivotX' | 'pivotY' | 'offsetX' | 'offsetY',
    value: string,
  ) => {
    const number = Number(value)
    if (Number.isFinite(number)) {
      updateFrameAlignment(currentFrame.id, { [key]: number })
    }
  }

  return (
    <div className="inspector-content anchor-panel" data-testid="anchor-calibration-panel">
      <section className="inspector-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Sprite Alignment</div>
            <strong className="panel-title">锚点校准</strong>
          </div>
          <button
            type="button"
            className={`mini-button ${enabled ? 'danger' : ''}`}
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? '退出校准' : '开始校准'}
          </button>
        </div>
        <p className="field-help">
          校准模式下图片固定在原图像素坐标中，只有十字准线和坐标输入会改变锚点。
        </p>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>当前帧</strong>
          <span>{size.width} × {size.height} px</span>
        </div>
        <div className="anchor-number-grid">
          <label>
            <span>锚点 X</span>
            <input
              aria-label="锚点 X"
              type="number"
              step="0.5"
              value={alignment.pivotX}
              onChange={(event) => updateNumber('pivotX', event.target.value)}
            />
          </label>
          <label>
            <span>锚点 Y</span>
            <input
              aria-label="锚点 Y"
              type="number"
              step="0.5"
              value={alignment.pivotY}
              onChange={(event) => updateNumber('pivotY', event.target.value)}
            />
          </label>
          <label>
            <span>偏移 X</span>
            <input
              aria-label="偏移 X"
              type="number"
              step="1"
              value={alignment.offsetX}
              onChange={(event) => updateNumber('offsetX', event.target.value)}
            />
          </label>
          <label>
            <span>偏移 Y</span>
            <input
              aria-label="偏移 Y"
              type="number"
              step="1"
              value={alignment.offsetY}
              onChange={(event) => updateNumber('offsetY', event.target.value)}
            />
          </label>
        </div>
        <div className="anchor-button-row">
          <button type="button" className="mini-button" onClick={() => applyPresetToAll('bottom-center')}>
            全部脚底中心
          </button>
          <button type="button" className="mini-button" onClick={() => applyPresetToAll('center')}>
            全部图片中心
          </button>
        </div>
      </section>

      <section className="inspector-section">
        <strong>校准显示</strong>
        <div className="anchor-option-row">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={(event) => setGridVisible(event.target.checked)}
            />
            显示逐像素网格
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={onionSkin}
              onChange={(event) => setOnionSkin(event.target.checked)}
            />
            显示洋葱皮
          </label>
        </div>
        <label className="field">
          <span>吸附方式</span>
          <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as typeof snapMode)}>
            <option value="pixel-center">像素中心</option>
            <option value="pixel-boundary">整数边界</option>
            <option value="free">自由坐标</option>
          </select>
        </label>
        <div className="anchor-zoom-row">
          <span>缩放</span>
          {[1, 2, 4, 8, 16].map((value) => (
            <button
              type="button"
              key={value}
              className={`mini-button ${zoom === value ? 'is-active' : ''}`}
              onClick={() => setZoom(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>动作统一布局</strong>
          <span>{actionAlignment ? '已启用' : '尚未启用'}</span>
        </div>
        {actionAlignment && (
          <div className="anchor-layout-summary">
            <span>逻辑画布：{actionAlignment.canvasWidth} × {actionAlignment.canvasHeight} px</span>
            <span>动作锚点：X {actionAlignment.anchorX} / Y {actionAlignment.anchorY}</span>
          </div>
        )}
        <label className="field">
          <span>动作统一缩放</span>
          <input
            aria-label="动作统一缩放"
            type="number"
            min="0.1"
            max="4"
            step="0.05"
            value={actionAlignment?.scale ?? 1}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) {
                updateActionAlignment({ scale: Math.max(0.1, Math.min(4, value)) })
              }
            }}
          />
        </label>
      </section>
    </div>
  )
}
