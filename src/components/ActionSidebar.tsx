import { useRef } from 'react'
import { getSelectedAction, useEditorStore } from '../store/editorStore'
import { t } from '../i18n'

export function ActionSidebar() {
  const bundle = useEditorStore((state) => state.bundle)
  const selectedActionId = useEditorStore((state) => state.selectedActionId)
  const selectAction = useEditorStore((state) => state.selectAction)
  const renameAction = useEditorStore((state) => state.renameAction)
  const action = useEditorStore((state) => getSelectedAction(state))
  const actionNameInput = useRef<HTMLInputElement>(null)

  if (!bundle || !action) {
    return (
      <aside className="panel action-panel">
        <div className="panel-heading">
          <span>{t('动作')}</span>
        </div>
        <div className="empty-list">{t('导入素材后显示动作。')}</div>
      </aside>
    )
  }

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
          <span>{t('动作')}</span>
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
          <span>{t('动作名称')}</span>
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
    </aside>
  )
}
