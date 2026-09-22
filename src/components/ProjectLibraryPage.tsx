import { useEffect, useRef, useState } from 'react'
import type { ProjectSummary } from '../services/projectPersistence'
import { useI18n } from '../i18n'

interface ProjectLibraryPageProps {
  projects: ProjectSummary[]
  activeProjectId?: string
  busy?: boolean
  error?: string
  onOpenProject: (projectId: string) => void
  onRemoveProject: (projectId: string) => void
  onRenameProject: (projectId: string, name: string) => void
  onClose: () => void
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ProjectLibraryPage({
  projects,
  activeProjectId,
  busy = false,
  error,
  onOpenProject,
  onRemoveProject,
  onRenameProject,
  onClose,
}: ProjectLibraryPageProps) {
  const { language, t } = useI18n()
  const [removeTarget, setRemoveTarget] = useState<ProjectSummary>()
  const [renameTarget, setRenameTarget] = useState<ProjectSummary>()
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renameTarget) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renameTarget])

  const cancelRename = () => {
    setRenameTarget(undefined)
    setRenameValue('')
  }

  const submitRename = () => {
    if (!renameTarget) {
      return
    }
    const name = renameValue.trim()
    if (name) {
      onRenameProject(renameTarget.id, name)
    }
    cancelRename()
  }

  return (
    <main className="project-library" data-testid="project-library">
      <div className="project-library-header">
        <div>
          <div className="eyebrow">{t('本地项目库')}</div>
          <h1>{t('精灵项目')}</h1>
          <p>{t('项目素材只保存在当前浏览器中，移除项目不会删除磁盘原文件。')}</p>
        </div>
        <button type="button" className="button" onClick={onClose} disabled={!activeProjectId}>
          {t('返回编辑器')}
        </button>
      </div>

      {error && (
        <div className="project-library-error" role="alert">
          {t(error)}
        </div>
      )}

      {projects.length === 0 ? (
        <section className="project-library-empty">
          <div className="placeholder-mark">SL</div>
          <h2>{t('还没有保存的项目')}</h2>
          <p>{t('从上方导入逐帧 PNG、图集项目或项目包；导入完成后会自动出现在这里。')}</p>
        </section>
      ) : (
        <section className="project-card-grid" aria-label={t('项目列表')}>
          {projects.map((project) => {
            const isActive = project.id === activeProjectId
            return (
              <article
                className={`project-card ${isActive ? 'is-active' : ''}`}
                key={project.id}
                data-project-id={project.id}
              >
                <div className="project-card-heading">
                  <div className="project-card-mark" aria-hidden="true">
                    {project.sourceMode === 'atlas' ? 'AT' : project.sourceMode === 'grid' ? 'GR' : project.sourceMode === 'regions' ? 'RG' : 'PN'}
                  </div>
                  <div>
                    <h2>{project.name}</h2>
                    <span>{project.sourceName || t('本地素材')}</span>
                  </div>
                  {isActive && <span className="project-active-badge">{t('当前')}</span>}
                </div>

                <div className="project-card-stats">
                  <span>
                    <strong>{project.frameCount}</strong> {t('帧')}
                  </span>
                  <span>
                    <strong>{project.animationCount}</strong> {t('动作')}
                  </span>
                  <span>
                    <strong>{project.warningCount}</strong> {t('缺失法线')}
                  </span>
                </div>

                <div className="project-card-footer">
                  <span>{t('更新于')} {t(formatDate(project.updatedAt, language === 'en' ? 'en-US' : 'zh-CN'))}</span>
                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="mini-button"
                      disabled={busy}
                      onClick={() => {
                        setRenameTarget(project)
                        setRenameValue(project.name)
                      }}
                    >
                      {t('重命名')}
                    </button>
                    <button
                      type="button"
                      className="mini-button danger"
                      disabled={busy}
                      onClick={() => setRemoveTarget(project)}
                    >
                      {t('移除')}
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => onOpenProject(project.id)}
                    >
                      {isActive ? t('打开编辑器') : t('打开项目')}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {renameTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={cancelRename}>
          <form
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-project-title"
            onSubmit={(event) => {
              event.preventDefault()
              submitRename()
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="rename-project-title">{t('重命名项目')}</h2>
            <label className="field">
              <span>{t('项目名称')}</span>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={cancelRename}>
                {t('取消')}
              </button>
              <button type="submit" className="button button-primary" disabled={!renameValue.trim()}>
                {t('保存名称')}
              </button>
            </div>
          </form>
        </div>
      )}

      {removeTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setRemoveTarget(undefined)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="eyebrow danger-text">{t('不可撤销')}</div>
            <h2 id="remove-project-title">{t('移除“{name}”？', { name: removeTarget.name })}</h2>
            <p>
              {t('这会删除浏览器中保存的项目数据，但不会删除你电脑上的原始 PNG、JSON 或 ZIP 文件。')}
            </p>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setRemoveTarget(undefined)}>
                {t('取消')}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  onRemoveProject(removeTarget.id)
                  setRemoveTarget(undefined)
                }}
              >
                {t('确认移除')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
