import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { markInternalDrag } from '../utils/dragAndDrop'
import { t } from '../i18n'

function pairTitle(
  normal: boolean,
  pairingStatus: 'matched' | 'manual' | 'missing' | 'mismatch',
): string {
  if (normal) {
    return pairingStatus === 'manual' ? t('手工配对法线图') : t('已配对法线图')
  }
  return pairingStatus === 'mismatch' ? t('图集布局不匹配') : t('缺少法线图')
}

export function FrameNavigator() {
  const bundle = useEditorStore((state) => state.bundle)
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const selectFrame = useEditorStore((state) => state.selectFrame)
  const reorderFrames = useEditorStore((state) => state.reorderFrames)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | undefined>()

  const frames = useMemo(() => {
    if (!bundle || !action) return []
    return action.frameIds.flatMap((frameId) => {
      const frame = bundle.frames.find((candidate) => candidate.id === frameId)
      return frame ? [frame] : []
    })
  }, [action, bundle])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [action?.id, currentFrameIndex])

  if (!bundle || !action) {
    return null
  }

  return (
    <section className="inspector-section frame-navigator-section">
      <div className="section-title-row">
        <strong>{t('帧导航')}</strong>
        <span className="count-badge">{frames.length}</span>
      </div>
      <p className="field-help">{t('与底部帧格同步；拖拽可调整帧顺序。')}</p>
      <div className="frame-list inspector-frame-list">
        {frames.map((frame, index) => {
          const active = currentFrame?.id === frame.id || index === currentFrameIndex
          return (
            <button
              type="button"
              key={frame.id}
              ref={active ? activeItemRef : undefined}
              draggable
              aria-current={active ? 'true' : undefined}
              className={`frame-item ${active ? 'is-active' : ''}`}
              title={`${frame.name} · ${pairTitle(Boolean(frame.normal), frame.pairingStatus)}`}
              onClick={() => selectFrame(frame.id)}
              onDragStart={(event) => {
                markInternalDrag(event)
                setDraggedIndex(index)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedIndex !== undefined) {
                  reorderFrames(action.id, draggedIndex, index)
                }
                setDraggedIndex(undefined)
              }}
              onDragEnd={() => setDraggedIndex(undefined)}
            >
              <span className="frame-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="frame-name">{frame.name}</span>
              <span
                className={`pair-dot pair-${frame.pairingStatus}`}
                title={pairTitle(Boolean(frame.normal), frame.pairingStatus)}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
