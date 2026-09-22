import { useState } from 'react'
import { getCurrentFrame, useEditorStore } from '../store/editorStore'
import { AnchorCalibrationPanel } from './AnchorCalibrationPanel'
import { FrameNavigator } from './FrameNavigator'
import { LightingPanel } from './LightingPanel'
import { ProjectPanel } from './ProjectPanel'
import { PalettePanel } from './PalettePanel'
import { t } from '../i18n'

interface InspectorPanelProps {
  rendererStatus: string
  onOpenLibrary: () => void
}

type InspectorTab = 'palette' | 'lighting' | 'anchor' | 'frame' | 'project'

export function InspectorPanel({ rendererStatus, onOpenLibrary }: InspectorPanelProps) {
  const [tab, setTab] = useState<InspectorTab>('project')
  const bundle = useEditorStore((state) => state.bundle)
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const pairNormal = useEditorStore((state) => state.pairNormal)

  const colorImage = bundle?.images.find((image) => image.id === currentFrame?.source.imageId)

  if (!bundle || !currentFrame) {
    return (
      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <span>{t('检查器')}</span>
        </div>
        <div className="empty-list">{t('选择一帧以编辑色板、光照和配对。')}</div>
      </aside>
    )
  }

  return (
    <aside className="panel inspector-panel">
      <div className="inspector-tabs inspector-tabs-four inspector-tabs-five" role="tablist">
        <button
          type="button"
          className={tab === 'palette' ? 'is-active' : ''}
          onClick={() => setTab('palette')}
        >
          {t('色板')}
        </button>
        <button
          type="button"
          className={tab === 'lighting' ? 'is-active' : ''}
          onClick={() => setTab('lighting')}
        >
          {t('光照')}
        </button>

        <button
          type="button"
          className={tab === 'frame' ? 'is-active' : ''}
          onClick={() => setTab('frame')}
        >
          {t('帧')}
        </button>
        <button
          type="button"
          className={tab === 'project' ? 'is-active' : ''}
          onClick={() => setTab('project')}
        >
          {t('工程')}
        </button>
        <button
          type="button"
          className={tab === 'anchor' ? 'is-active' : ''}
          onClick={() => setTab('anchor')}
        >
          {t('锚点')}
        </button>
      </div>

      {tab === 'palette' && <PalettePanel />}
      {tab === 'lighting' && <LightingPanel />}
      {tab === 'anchor' && <AnchorCalibrationPanel />}

      {tab === 'frame' && (
        <div className="inspector-content">
          <FrameNavigator />
          <section className="inspector-section">
            <div className="eyebrow">{t('当前帧')}</div>
            <div className="selected-frame-card">
              <div className={`large-pair-indicator pair-${currentFrame.pairingStatus}`} />
              <div>
                <strong>{currentFrame.name}</strong>
                <span>{currentFrame.source.name}</span>
              </div>
            </div>
          </section>
          <section className="inspector-section">
            <label className="field">
              <span>{t('对应法线图')}</span>
              <select
                value={currentFrame.normal?.id ?? ''}
                onChange={(event) => {
                  const candidate =
                    bundle.normalCandidates.find((item) => item.id === event.target.value) ??
                    undefined
                  pairNormal(currentFrame.id, candidate)
                }}
              >
                <option value="">{t('未配对（使用平坦法线）')}</option>
                {bundle.normalCandidates.map((candidate) => {
                  const normalImage = bundle.images.find((image) => image.id === candidate.imageId)
                  const sizeMatches =
                    !colorImage ||
                    !normalImage ||
                    (colorImage.width === normalImage.width &&
                      colorImage.height === normalImage.height)
                  return (
                    <option key={candidate.id} value={candidate.id} disabled={!sizeMatches}>
                      {candidate.name}
                      {normalImage ? ` (${normalImage.width}×${normalImage.height})` : ''}
                      {sizeMatches ? '' : ` ${t('尺寸不匹配')}`}
                    </option>
                  )
                })}
              </select>
            </label>
            <p className="field-help">
              {bundle.mode === 'atlas'
                ? t('图集模式要求颜色与法线严格同布局。')
                : bundle.mode === 'grid'
                  ? t('固定网格模式使用统一帧尺寸。')
                  : bundle.mode === 'regions'
                    ? t('不规则区域模式使用任意矩形帧。')
                    : t('逐帧模式按文件名自动配对。')}
            </p>
          </section>
          <section className="inspector-section key-value-list">
            <div>
              <span>{t('输入模式')}</span>
              <strong>
                {bundle.mode === 'atlas'
                  ? t('JSON 图集')
                  : bundle.mode === 'grid'
                    ? t('固定网格')
                    : bundle.mode === 'regions'
                      ? t('不规则区域')
                      : t('逐帧 PNG')}
              </strong>
            </div>
            <div>
              <span>{t('色板模式')}</span>
              <strong>{bundle.paletteMode === 'indexed' ? t('索引色') : t('全彩')}</strong>
            </div>
            <div>
              <span>{t('配对状态')}</span>
              <strong>
                {currentFrame.normal
                  ? currentFrame.pairingStatus === 'manual'
                    ? t('手工校正')
                    : t('自动配对')
                  : t('缺失 / 阻止')}
              </strong>
            </div>
          </section>
        </div>
      )}

      {tab === 'project' && <ProjectPanel rendererStatus={rendererStatus} onOpenLibrary={onOpenLibrary} />}
    </aside>
  )
}
