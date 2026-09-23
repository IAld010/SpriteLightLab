import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import { ActionManager } from './ActionManager'
import { ExportPanel } from './ExportPanel'
import { ImportRulesPanel } from './ImportRulesPanel'
import { t } from '../i18n'

interface ProjectPanelProps {
  rendererStatus: string
  onOpenLibrary: () => void
}

export function ProjectPanel({ rendererStatus, onOpenLibrary }: ProjectPanelProps) {
  const bundle = useEditorStore((state) => state.bundle)
  const warnings = useEditorStore((state) => state.warnings)
  const projectName = useProjectStore((state) => state.projectName)
  const setProjectName = useProjectStore((state) => state.setProjectName)

  return (
    <div className="inspector-content project-panel">
      <ActionManager />
      <section className="inspector-section">
        <label className="field">
          <span>{t('项目名称')}</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
      </section>

      <section className="inspector-section key-value-list">
        <div>
          <span>{t('数据来源')}</span>
          <strong>{bundle?.sourceName ?? t('尚未导入')}</strong>
        </div>
        <div>
          <span>{t('渲染后端')}</span>
          <strong>{t(rendererStatus)}</strong>
        </div>
        <div>
          <span>{t('色板模式')}</span>
          <strong>{bundle?.paletteMode === 'indexed' ? t('索引色') : t('全彩')}</strong>
        </div>
        <div>
          <span>{t('隐私')}</span>
          <strong>{t('仅本地处理')}</strong>
        </div>
      </section>

      <ImportRulesPanel />

      {bundle ? <ExportPanel bundle={bundle} projectName={projectName} /> : null}

      <section className="inspector-section">
        <button type="button" className="button full-width-button" onClick={onOpenLibrary}>
          {'\u6253\u5f00\u9879\u76ee\u5e93\u4e0e\u79fb\u9664\u9879\u76ee'}
        </button>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <strong>{t('问题')}</strong>
          <span>{warnings.length}</span>
        </div>
        <div className="warning-list">
          {warnings.length === 0 ? (
            <div className="success-card">{t('当前没有需要处理的问题。')}</div>
          ) : (
            warnings.map((warning, index) => (
              <div
                className={`warning-card warning-${warning.severity}`}
                key={`${warning.code}:${warning.frameId ?? index}:${index}`}
              >
                <strong>{warning.severity === 'error' ? t('阻止配对') : t('注意')}</strong>
                <span>{t(warning.message)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
