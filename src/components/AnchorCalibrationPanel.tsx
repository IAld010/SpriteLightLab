import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { resolveFrameAlignment } from '../domain/alignment'
import { t } from '../i18n'

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
  const selectFrame = useEditorStore((state) => state.selectFrame)
  const setZoom = useEditorStore((state) => state.setAnchorCalibrationZoom)
  const setGridVisible = useEditorStore((state) => state.setAnchorGridVisible)
  const setOnionSkin = useEditorStore((state) => state.setAnchorOnionSkin)
  const setSnapMode = useEditorStore((state) => state.setAnchorSnapMode)
  const updateFrameAlignment = useEditorStore((state) => state.updateFrameAlignment)
  const updateActionAlignment = useEditorStore((state) => state.updateActionAlignment)
  const applyPresetToAll = useEditorStore((state) => state.applyAnchorPresetToAll)

  if (!bundle || !currentFrame || !action) {
    return <div className="empty-list">{t('导入素材后启用锚点校准。')}</div>
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
            <strong className="panel-title">{t('锚点校准')}</strong>
          </div>
          <button
            type="button"
            className={`mini-button ${enabled ? 'danger' : ''}`}
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? t('退出校准') : t('开始校准')}
          </button>
        </div>
        <p className="field-help">
          {t('校准模式下图片固定在原图像素坐标中，只有十字准线和坐标输入会改变锚点。')}
        </p>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>{t('当前帧')}</strong>
          <span>{size.width} × {size.height} px</span>
        </div>
        <label className="field">
          <span>{'\u5f53\u524d\u5e27'}</span>
          <select data-testid="anchor-frame-select" value={currentFrame.id} onChange={(event) => selectFrame(event.target.value)}>
            {action.frameIds.map((frameId, index) => {
              const frame = bundle.frames.find((candidate) => candidate.id === frameId)
              return frame ? (
                <option value={frame.id} key={frame.id}>
                  {index + 1}. {frame.name}
                </option>
              ) : null
            })}
          </select>
        </label>
        <div className="anchor-number-grid">
          <label>
            <span>{t('锚点 X')}</span>
            <input
              aria-label={t('锚点 X')}
              type="number"
              step="0.5"
              value={alignment.pivotX}
              onChange={(event) => updateNumber('pivotX', event.target.value)}
            />
          </label>
          <label>
            <span>{t('锚点 Y')}</span>
            <input
              aria-label={t('锚点 Y')}
              type="number"
              step="0.5"
              value={alignment.pivotY}
              onChange={(event) => updateNumber('pivotY', event.target.value)}
            />
          </label>
          <label>
            <span>{t('偏移 X')}</span>
            <input
              aria-label={t('偏移 X')}
              type="number"
              step="1"
              value={alignment.offsetX}
              onChange={(event) => updateNumber('offsetX', event.target.value)}
            />
          </label>
          <label>
            <span>{t('偏移 Y')}</span>
            <input
              aria-label={t('偏移 Y')}
              type="number"
              step="1"
              value={alignment.offsetY}
              onChange={(event) => updateNumber('offsetY', event.target.value)}
            />
          </label>
        </div>
        <div className="anchor-button-row">
          <button type="button" className="mini-button" onClick={() => applyPresetToAll('bottom-center')}>
            {t('全部脚底中心')}
          </button>
          <button type="button" className="mini-button" onClick={() => applyPresetToAll('center')}>
            {t('全部图片中心')}
          </button>
        </div>
      </section>

      <section className="inspector-section">
        <strong>{t('校准显示')}</strong>
        <div className="anchor-option-row">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={(event) => setGridVisible(event.target.checked)}
            />
            {t('显示逐像素网格')}
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={onionSkin}
              onChange={(event) => setOnionSkin(event.target.checked)}
            />
            {t('显示洋葱皮')}
          </label>
        </div>
        <label className="field">
          <span>{t('吸附方式')}</span>
          <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as typeof snapMode)}>
            <option value="pixel-center">{t('像素中心')}</option>
            <option value="pixel-boundary">{t('整数边界')}</option>
            <option value="free">{t('自由坐标')}</option>
          </select>
        </label>
        <label className="anchor-zoom-slider">
          <span>{'\u7f29\u653e'}</span>
          <input
            type="range"
            min="1"
            max="24"
            step="1"
            value={zoom}
            aria-label="Anchor calibration zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <output>{zoom}{'\u00d7'}</output>
        </label>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>{t('动作统一布局')}</strong>
          <span>{actionAlignment ? t('已启用') : t('尚未启用')}</span>
        </div>
        {actionAlignment && (
          <div className="anchor-layout-summary">
            <span>{t('逻辑画布：{width} × {height} px', { width: actionAlignment.canvasWidth, height: actionAlignment.canvasHeight })}</span>
            <span>{t('动作锚点：X {x} / Y {y}', { x: actionAlignment.anchorX, y: actionAlignment.anchorY })}</span>
          </div>
        )}
        <label className="field">
          <span>{t('动作统一缩放')}</span>
          <input
            aria-label={t('动作统一缩放')}
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
