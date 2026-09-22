import { useMemo } from 'react'
import { renderRawSourceFrameCanvas } from '../renderer/RefinementRenderer'
import { blendModeLabel, useRefinementStore } from '../store/refinementStore'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import type { RefinementBlendMode } from '../domain/types'
import { useI18n } from '../i18n'

export function RefinementLayerPanel() {
  const { t } = useI18n()
  const frame = useEditorStore((state) => getCurrentFrame(state))
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentIndex = useEditorStore((state) => state.currentFrameIndex)
  const refinement = useRefinementStore((state) => frame ? state.refinements[frame.id] : undefined)
  const selectedLayerId = useRefinementStore((state) => state.selectedLayerId)
  const addLayer = useRefinementStore((state) => state.addLayer)
  const updateLayer = useRefinementStore((state) => state.updateLayer)
  const removeLayer = useRefinementStore((state) => state.removeLayer)
  const moveLayer = useRefinementStore((state) => state.moveLayer)
  const copyCel = useRefinementStore((state) => state.copyCel)
  const clearCel = useRefinementStore((state) => state.clearCel)
  const deleteCel = useRefinementStore((state) => state.deleteCel)
  const resetFrame = useRefinementStore((state) => state.resetFrame)
  const updateSourceLayer = useRefinementStore((state) => state.updateSourceLayer)
  const copySourceLayer = useRefinementStore((state) => state.copySourceLayer)

  const orderedLayers = useMemo(() => [...(refinement?.layers ?? [])].reverse(), [refinement])
  const selectedLayer = refinement?.layers.find((layer) => layer.id === selectedLayerId)

  if (!frame) return <div className="refinement-empty">{t('请选择一帧。')}</div>

  const copySource = async () => {
    const bundle = useEditorStore.getState().bundle
    const sourceImage = bundle?.images.find((image) => image.id === frame.source.imageId)
    const width = frame.source.rect?.width ?? sourceImage?.width ?? 1
    const height = frame.source.rect?.height ?? sourceImage?.height ?? 1
    if (!bundle) return
    useRefinementStore.getState().ensureFrame(frame.id, width, height)
    const canvas = await renderRawSourceFrameCanvas({ bundle, frame })
    const blob = await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((result) => resolve(result ?? undefined), 'image/png')
    })
    if (blob) copySourceLayer(frame.id, blob, width, height)
  }

  return (
    <div className="refinement-layer-panel">
      <section className="refinement-section">
        <div className="refinement-section-head">
          <strong>{t('图层')}</strong>
          <button type="button" onClick={() => addLayer(frame.id, 'raster')}>{t('新建')}</button>
        </div>
        <div className="refinement-layer-list">
          {orderedLayers.map((layer) => (
            <div key={layer.id} className={`refinement-layer-row ${selectedLayerId === layer.id ? 'is-active' : ''}`}>
              <button type="button" className="icon-action" title={t(layer.visible ? '隐藏图层' : '显示图层')} onClick={() => updateLayer(frame.id, layer.id, { visible: !layer.visible })}>
                {layer.visible ? '◉' : '○'}
              </button>
              <button type="button" className="icon-action" title={t(layer.locked ? '解锁图层' : '锁定图层')} onClick={() => updateLayer(frame.id, layer.id, { locked: !layer.locked })}>
                {layer.locked ? '▣' : '□'}
              </button>
              <button type="button" className="refinement-layer-name" onClick={() => useRefinementStore.getState().selectLayer(layer.id)}>
                {t(layer.name)}
              </button>
              <div className="refinement-layer-move">
                <button type="button" title={t('上移')} onClick={() => moveLayer(frame.id, layer.id, 'up')}>↑</button>
                <button type="button" title={t('下移')} onClick={() => moveLayer(frame.id, layer.id, 'down')}>↓</button>
              </div>
            </div>
          ))}
          <div className="source-layer-block">
            <div className="refinement-layer-row source-layer">
              <button
                type="button"
                className="icon-action"
                data-testid="toggle-source-layer"
                title={t('显示/隐藏源图层')}
                onClick={() => {
                  useRefinementStore.getState().ensureFrame(frame.id, frame.source.rect?.width ?? 1, frame.source.rect?.height ?? 1)
                  updateSourceLayer(frame.id, { sourceVisible: !(refinement?.sourceVisible ?? true) })
                }}
              >
                {refinement?.sourceVisible === false ? '○' : '◉'}
              </button>
              <span className="icon-action">▣</span>
              <span className="refinement-layer-name">{t('源图层')}</span>
              <span className="source-readonly">{t('只读')}</span>
            </div>
            <div className="source-layer-controls">
              <button type="button" className="source-copy-button" data-testid="copy-source-layer" onClick={() => void copySource()}>
                {t('复制源图层')}
              </button>
              {refinement && (
                <label className="source-opacity-inline">
                  <span>{t('不透明度')}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={refinement.sourceOpacity ?? 1}
                    onChange={(event) => updateSourceLayer(frame.id, { sourceOpacity: Number(event.target.value) }, false)}
                  />
                </label>
              )}
            </div>
          </div>
        <div className="refinement-action-row">
          <button type="button" disabled={!refinement} onClick={() => selectedLayer && removeLayer(frame.id, selectedLayer.id)}>{t('删除图层')}</button>
          <button type="button" onClick={() => resetFrame(frame.id)}>{t('恢复原图')}</button>
        </div>
        </div>
      </section>

      {selectedLayer && (
        <section className="refinement-section">
          <div className="refinement-section-head"><strong>{t('图层属性')}</strong></div>
          <label className="field compact-field">
            <span>{t('名称')}</span>
            <input value={selectedLayer.name} onChange={(event) => updateLayer(frame.id, selectedLayer.id, { name: event.target.value }, false)} />
          </label>
          <label className="field compact-field">
            <span>{t('不透明度')}</span>
            <input type="range" min="0" max="1" step="0.01" value={selectedLayer.opacity} onChange={(event) => updateLayer(frame.id, selectedLayer.id, { opacity: Number(event.target.value) }, false)} />
          </label>
          <label className="field compact-field">
            <span>{t('混合模式')}</span>
            <select value={selectedLayer.blendMode} onChange={(event) => updateLayer(frame.id, selectedLayer.id, { blendMode: event.target.value as RefinementBlendMode })}>
              {(['normal', 'add', 'multiply', 'screen'] as const).map((mode) => <option key={mode} value={mode}>{t(blendModeLabel(mode))}</option>)}
            </select>
          </label>
        </section>
      )}

      <section className="refinement-section">
        <div className="refinement-section-head"><strong>{t('Cel')}</strong><span>{selectedLayer ? t('当前图层') : '—'}</span></div>
        <div className="refinement-action-row wrap">
          <button type="button" disabled={!selectedLayer || currentIndex <= 0} onClick={() => {
            const previousFrameId = action?.frameIds[currentIndex - 1]
            const previousFrame = useEditorStore.getState().bundle?.frames.find((item) => item.id === previousFrameId)
            if (previousFrame && selectedLayer) {
              useRefinementStore.getState().ensureFrame(previousFrame.id, previousFrame.source.rect?.width ?? 1, previousFrame.source.rect?.height ?? 1)
              copyCel(previousFrame.id, frame.id, selectedLayer.id)
            }
          }}>{t('复制上一帧')}</button>
          <button type="button" disabled={!selectedLayer} onClick={() => selectedLayer && clearCel(frame.id, selectedLayer.id)}>{t('清空 Cel')}</button>
          <button type="button" disabled={!selectedLayer} onClick={() => selectedLayer && deleteCel(frame.id, selectedLayer.id)}>{t('删除 Cel')}</button>
        </div>
      </section>
    </div>
  )
}


