import { useRef, useState } from 'react'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'

export function ActionSidebar() {
  const bundle = useEditorStore((state) => state.bundle)
  const selectedActionId = useEditorStore((state) => state.selectedActionId)
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const selectAction = useEditorStore((state) => state.selectAction)
  const selectFrame = useEditorStore((state) => state.selectFrame)
  const renameAction = useEditorStore((state) => state.renameAction)
  const reorderFrames = useEditorStore((state) => state.reorderFrames)
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const actionNameInput = useRef<HTMLInputElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | undefined>()

  if (!bundle || !action) {
    return (
      <aside className="panel action-panel">
        <div className="panel-heading">
          <span>动作</span>
        </div>
        <div className="empty-list">导入素材后显示动作与帧。</div>
      </aside>
    )
  }

  const frames = action.frameIds.flatMap((frameId) => {
    const frame = bundle.frames.find((candidate) => candidate.id === frameId)
    return frame ? [frame] : []
  })

  const commitRename = () => {
    const draftName = actionNameInput.current?.value ?? ''
    if (draftName.trim() && draftName.trim() !== action.name) {
      renameAction(action.id, draftName)
    } else if (actionNameInput.current) {
      actionNameInput.current.value = action.name
    }
  }

  return (
    <aside className="panel action-panel">
      <section className="panel-section actions-section">
        <div className="panel-heading">
          <span>动作</span>
          <span className="count-badge">{bundle.animations.length}</span>
        </div>
        <div className="action-list">
          {bundle.animations.map((clip) => (
            <button
              type="button"
              key={clip.id}
              className={`action-item ${clip.id === selectedActionId ? 'is-active' : ''}`}
              onClick={() => selectAction(clip.id)}
            >
              <span className="action-glyph">▶</span>
              <span className="action-name">{clip.name}</span>
              <span className="action-count">{clip.frameIds.length}</span>
            </button>
          ))}
        </div>
        <label className="field compact-field">
          <span>动作名称</span>
          <input
            key={action.id}
            ref={actionNameInput}
            defaultValue={action.name}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        </label>
      </section>

      <section className="panel-section frames-section">
        <div className="panel-heading">
          <span>帧导航</span>
          <span className="hint-label">与底栏同步</span>
        </div>
        <div className="frame-list">
          {frames.map((frame, index) => {
            const active = currentFrame?.id === frame.id || index === currentFrameIndex
            return (
              <button
                type="button"
                key={frame.id}
                draggable
                className={`frame-item ${active ? 'is-active' : ''}`}
                onClick={() => selectFrame(frame.id)}
                onDragStart={() => setDraggedIndex(index)}
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
                  title={
                    frame.normal
                      ? frame.pairingStatus === 'manual'
                        ? '手工配对法线图'
                        : '已配对法线图'
                      : frame.pairingStatus === 'mismatch'
                        ? '图集布局不匹配'
                        : '缺少法线图'
                  }
                />
              </button>
            )
          })}
        </div>
      </section>
    </aside>
  )
}