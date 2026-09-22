import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { eventsForFrame, useFrameEventStore } from '../store/frameEventStore'
import type { CameraShakePreset, CameraShakePayload } from '../domain/types'
import { useI18n } from '../i18n'

const PRESET_LABELS: Record<CameraShakePreset, string> = {
  light: '轻击',
  heavy: '重击',
  explosion: '爆炸',
  landing: '落地',
  custom: '自定义',
}

export function FrameEventPanel() {
  const { t } = useI18n()
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const events = useFrameEventStore((state) => state.events)
  const selectedEventId = useFrameEventStore((state) => state.selectedEventId)
  const addEvent = useFrameEventStore((state) => state.addEvent)
  const selectEvent = useFrameEventStore((state) => state.selectEvent)
  const updateEvent = useFrameEventStore((state) => state.updateEvent)
  const updatePayload = useFrameEventStore((state) => state.updatePayload)
  const applyPreset = useFrameEventStore((state) => state.applyPreset)
  const duplicateEvent = useFrameEventStore((state) => state.duplicateEvent)
  const removeEvent = useFrameEventStore((state) => state.removeEvent)

  if (!action || !currentFrame) return null
  const frameEvents = eventsForFrame(events, action.id, currentFrame.id)
  const selectedEvent = events.find((event) => event.id === selectedEventId && event.frameId === currentFrame.id)
    ?? frameEvents[0]

  const setPayload = (patch: Partial<CameraShakePayload>) => {
    if (selectedEvent) updatePayload(selectedEvent.id, patch)
  }

  return (
    <section className="frame-event-panel">
      <div className="frame-event-panel-heading">
        <div>
          <strong>{t('帧事件')}</strong>
          <span>{currentFrame.name}</span>
        </div>
        <button type="button" onClick={() => addEvent(action.id, currentFrame.id)}>+ {t('摄像机抖动')}</button>
      </div>

      <div className="frame-event-list">
        {frameEvents.length === 0 ? (
          <div className="frame-event-empty">{t('当前帧没有事件')}</div>
        ) : frameEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            className={`frame-event-list-item ${selectedEvent?.id === event.id ? 'is-active' : ''}`}
            onClick={() => selectEvent(event.id)}
          >
            <span>◆</span>
            <strong>{t('摄像机抖动')}</strong>
            <span>{t(PRESET_LABELS[event.payload.preset])}</span>
          </button>
        ))}
      </div>

      {selectedEvent && (
        <div className="frame-event-panel-inspector">
          <label className="checkbox-row">
            <input type="checkbox" checked={selectedEvent.enabled} onChange={(event) => updateEvent(selectedEvent.id, { enabled: event.target.checked })} />
            {t('启用')}
          </label>
          <label className="field compact-field">
            <span>{t('预设')}</span>
            <select value={selectedEvent.payload.preset} onChange={(event) => applyPreset(selectedEvent.id, event.target.value as CameraShakePreset)}>
              {Object.keys(PRESET_LABELS).map((preset) => <option key={preset} value={preset}>{t(PRESET_LABELS[preset as CameraShakePreset])}</option>)}
            </select>
          </label>
          <label className="field compact-field"><span>{t('强度')}</span><input type="number" min="0" max="1" step="0.05" value={selectedEvent.payload.strength} onChange={(event) => setPayload({ strength: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('持续时间')}</span><input type="number" min="20" max="5000" step="10" value={selectedEvent.payload.durationMs} onChange={(event) => setPayload({ durationMs: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('频率')}</span><input type="number" min="1" max="120" step="1" value={selectedEvent.payload.frequency} onChange={(event) => setPayload({ frequency: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('衰减')}</span><input type="number" min="0.001" max="1" step="0.005" value={selectedEvent.payload.decay} onChange={(event) => setPayload({ decay: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('水平位移')}</span><input type="number" min="0" max="3" step="0.05" value={selectedEvent.payload.xWeight} onChange={(event) => setPayload({ xWeight: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('垂直位移')}</span><input type="number" min="0" max="3" step="0.05" value={selectedEvent.payload.yWeight} onChange={(event) => setPayload({ yWeight: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('旋转权重')}</span><input type="number" min="0" max="3" step="0.05" value={selectedEvent.payload.rotationWeight} onChange={(event) => setPayload({ rotationWeight: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('缩放权重')}</span><input type="number" min="0" max="3" step="0.05" value={selectedEvent.payload.scaleWeight} onChange={(event) => setPayload({ scaleWeight: Number(event.target.value) })} /></label>
          <label className="field compact-field"><span>{t('随机种子')}</span><input type="number" step="1" value={selectedEvent.payload.seed} onChange={(event) => setPayload({ seed: Number(event.target.value) })} /></label>
          <div className="frame-event-panel-actions">
            <button type="button" onClick={() => duplicateEvent(selectedEvent.id)}>{t('复制事件')}</button>
            <button type="button" onClick={() => removeEvent(selectedEvent.id)}>{t('删除事件')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
