import { useState } from 'react'
import { getCurrentFrame, useEditorStore } from '../store/editorStore'
import { AnchorCalibrationPanel } from './AnchorCalibrationPanel'
import { FrameNavigator } from './FrameNavigator'
import { LightingPanel } from './LightingPanel'
import { ProjectPanel } from './ProjectPanel'
import { PalettePanel } from './PalettePanel'

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
          <span>检查器</span>
        </div>
        <div className="empty-list">选择一帧以编辑色板、光照和配对。</div>
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
          色板
        </button>
        <button
          type="button"
          className={tab === 'lighting' ? 'is-active' : ''}
          onClick={() => setTab('lighting')}
        >
          光照
        </button>

        <button
          type="button"
          className={tab === 'frame' ? 'is-active' : ''}
          onClick={() => setTab('frame')}
        >
          帧
        </button>
        <button
          type="button"
          className={tab === 'project' ? 'is-active' : ''}
          onClick={() => setTab('project')}
        >
          工程
        </button>
        <button
          type="button"
          className={tab === 'anchor' ? 'is-active' : ''}
          onClick={() => setTab('anchor')}
        >
          {'\u951a\u70b9'}
        </button>
      </div>

      {tab === 'palette' && <PalettePanel />}
      {tab === 'lighting' && <LightingPanel />}
      {tab === 'anchor' && <AnchorCalibrationPanel />}

      {tab === 'frame' && (
        <div className="inspector-content">
          <FrameNavigator />
          <section className="inspector-section">
            <div className="eyebrow">当前帧</div>
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
              <span>对应法线图</span>
              <select
                value={currentFrame.normal?.id ?? ''}
                onChange={(event) => {
                  const candidate =
                    bundle.normalCandidates.find((item) => item.id === event.target.value) ??
                    undefined
                  pairNormal(currentFrame.id, candidate)
                }}
              >
                <option value="">未配对（使用平坦法线）</option>
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
                      {sizeMatches ? '' : ' 尺寸不匹配'}
                    </option>
                  )
                })}
              </select>
            </label>
            <p className="field-help">
              {bundle.mode === 'atlas' ? '\u56fe\u96c6\u6a21\u5f0f\u8981\u6c42\u989c\u8272\u4e0e\u6cd5\u7ebf\u4e25\u683c\u540c\u5e03\u5c40\u3002' : bundle.mode === 'grid' ? '\u56fa\u5b9a\u7f51\u683c\u6a21\u5f0f\u4f7f\u7528\u7edf\u4e00\u5e27\u5c3a\u5bf8\u3002' : bundle.mode === 'regions' ? '\u4e0d\u89c4\u5219\u533a\u57df\u6a21\u5f0f\u4f7f\u7528\u4efb\u610f\u77e9\u5f62\u5e27\u3002' : '\u9010\u5e27\u6a21\u5f0f\u6309\u6587\u4ef6\u540d\u81ea\u52a8\u914d\u5bf9\u3002'}
            </p>
          </section>
          <section className="inspector-section key-value-list">
            <div>
              <span>输入模式</span>
              <strong>{bundle.mode === 'atlas' ? 'JSON \u56fe\u96c6' : bundle.mode === 'grid' ? '\u56fa\u5b9a\u7f51\u683c' : bundle.mode === 'regions' ? '\u4e0d\u89c4\u5219\u533a\u57df' : '\u9010\u5e27 PNG'}</strong>
            </div>
            <div>
              <span>色板模式</span>
              <strong>{bundle.paletteMode === 'indexed' ? '索引色' : '全彩'}</strong>
            </div>
            <div>
              <span>配对状态</span>
              <strong>
                {currentFrame.normal
                  ? currentFrame.pairingStatus === 'manual'
                    ? '手工校正'
                    : '自动配对'
                  : '缺失 / 阻止'}
              </strong>
            </div>
          </section>
        </div>
      )}

      {tab === 'project' && <ProjectPanel rendererStatus={rendererStatus} onOpenLibrary={onOpenLibrary} />}
    </aside>
  )
}
