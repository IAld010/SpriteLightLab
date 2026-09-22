import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { AnchorCalibrationOverlay } from './AnchorCalibrationOverlay'
import { AnchorCalibrationPanel } from './AnchorCalibrationPanel'
import { t } from '../i18n'

export function AnchorCalibrationPage() {
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const setEnabled = useEditorStore((state) => state.setAnchorCalibrationEnabled)

  return (
    <main className="anchor-calibration-page" data-testid="anchor-calibration-page">
      <header className="anchor-calibration-page-header">
        <button
          type="button"
          className="button-ghost"
          onClick={() => setEnabled(false)}
        >
          ← {t('返回主工作区')}
        </button>
        <div>
          <strong>{t('锚点校准')}</strong>
          <span>
            {action?.name ?? t('动作')}
            {' · '}
            {t('帧 {index}', { index: currentFrameIndex + 1 })}
            {currentFrame ? ` / ${currentFrame.name}` : ''}
          </span>
        </div>
      </header>
      <div className="anchor-calibration-page-body">
        <AnchorCalibrationOverlay />
        <aside className="anchor-calibration-page-inspector">
          <AnchorCalibrationPanel />
        </aside>
      </div>
    </main>
  )
}
