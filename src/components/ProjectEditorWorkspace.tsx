import { useState } from 'react'
import { DrawingCanvas } from './DrawingCanvas'
import { CompactFrameStrip } from './CompactFrameStrip'
import { RefinementLayerPanel } from './RefinementLayerPanel'
import { currentProjectFileName, exportCurrentProjectZip } from '../services/currentProjectSnapshot'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import { useRefinementStore } from '../store/refinementStore'
import { downloadBlob } from '../utils/download'
import { useI18n } from '../i18n'

interface ProjectEditorWorkspaceProps {
  saveStatus: 'saved' | 'dirty' | 'saving' | 'failed'
  onSave: () => void
  onExit: () => void
}

function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
}

export function ProjectEditorWorkspace({ saveStatus, onSave, onExit }: ProjectEditorWorkspaceProps) {
  const { language, setLanguage, t } = useI18n()
  const bundle = useEditorStore((state) => state.bundle)
  const action = useEditorStore((state) => getSelectedAction(state))
  const frame = useEditorStore((state) => getCurrentFrame(state))
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const stepFrame = useEditorStore((state) => state.stepFrame)
  const toggleLoop = useEditorStore((state) => state.toggleLoop)
  const setFps = useEditorStore((state) => state.setFps)
  const showRefinement = useEditorStore((state) => state.settings.showRefinement !== false)
  const setShowRefinement = useEditorStore((state) => state.setShowRefinement)
  const projectName = useProjectStore((state) => state.projectName)
  const tool = useRefinementStore((state) => state.tool)
  const primaryColor = useRefinementStore((state) => state.primaryColor)
  const setPrimaryColor = useRefinementStore((state) => state.setPrimaryColor)
  const brushSize = useRefinementStore((state) => state.brushSize)
  const setBrushSize = useRefinementStore((state) => state.setBrushSize)
  const pixelGrid = useRefinementStore((state) => state.pixelGrid)
  const setPixelGrid = useRefinementStore((state) => state.setPixelGrid)
  const onionSkin = useRefinementStore((state) => state.onionSkin)
  const updateOnionSkin = useRefinementStore((state) => state.updateOnionSkin)
  const setNotice = useEditorStore((state) => state.setNotice)
  const [packageBusy, setPackageBusy] = useState(false)

  if (!bundle || !frame || !action) {
    return (
      <main className="project-editor-root editor-empty">
        <button type="button" className="button" onClick={onExit}>{t('返回预览')}</button>
        <p>{t('请先打开一个精灵项目。')}</p>
      </main>
    )
  }

  const saveLabel = saveStatus === 'saving'
    ? t('正在保存')
    : saveStatus === 'failed'
      ? t('保存失败')
      : saveStatus === 'dirty'
        ? t('有未保存修改')
        : t('已保存')
  const refinedFrames = Object.values(useRefinementStore.getState().refinements)
    .filter((item) => item.cels.some((cel) => Boolean(cel.bitmapAssetId))).length

  /** Packages the live editing state, including strokes that were not saved yet. */
  const exportPackage = async () => {
    setPackageBusy(true)
    try {
      const bytes = await exportCurrentProjectZip()
      downloadBlob(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }),
        `${currentProjectFileName()}.spritelab.zip`,
      )
      setNotice({ tone: 'success', message: '已导出 ZIP 项目包。' })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'ZIP 导出失败。',
      })
    } finally {
      setPackageBusy(false)
    }
  }
  const paletteColors = bundle.paletteSources.slice(0, 128)
  const toolLabel = tool === 'pencil' ? '铅笔' : tool === 'eraser' ? '橡皮擦' : tool === 'bucket' ? '油漆桶' : tool === 'eyedropper' ? '吸管' : tool === 'line' ? '直线' : tool === 'rectangle' ? '矩形' : tool === 'ellipse' ? '椭圆' : tool === 'select' ? '矩形选区' : tool === 'move' ? '移动选区' : '平移画布'

  return (
    <main className="project-editor-root aseprite-editor">
      <div className="aseprite-commandbar">
        <div className="aseprite-document-identity">
          <span className="editor-app-mark">SL</span>
          <div className="editor-document-title">
            <strong>{projectName}</strong>
            <span>{action.name} · {frame.name} · {currentFrameIndex + 1}/{action.frameIds.length}</span>
          </div>
        </div>

        <div className="aseprite-command-group">
          <button type="button" className={showRefinement ? 'is-active' : ''} onClick={() => setShowRefinement(!showRefinement)}>{t('显示细化')}</button>
          <button type="button" className={onionSkin.enabled ? 'is-active' : ''} onClick={() => updateOnionSkin({ enabled: !onionSkin.enabled })}>{t('洋葱皮')}</button>
          <button type="button" className={pixelGrid ? 'is-active' : ''} onClick={() => setPixelGrid(!pixelGrid)}>{t('像素网格')}</button>
        </div>

        <div className="aseprite-transport" aria-label={t('播放控制')}>
          <button type="button" onClick={() => stepFrame(-1)} aria-label={t('上一帧')} title={t('上一帧')}><Icon path="M6 5v14M18 6l-8 6 8 6V6z" /></button>
          <button type="button" className="transport-play" onClick={() => setPlaying(!isPlaying)} aria-label={isPlaying ? t('暂停') : t('播放')} title={isPlaying ? t('暂停') : t('播放')} data-testid="editor-play-toggle"><Icon path={isPlaying ? 'M8 6h3v12H8V6zm5 0h3v12h-3V6z' : 'M8 5l11 7-11 7V5z'} /></button>
          <button type="button" onClick={() => stepFrame(1)} aria-label={t('下一帧')} title={t('下一帧')}><Icon path="M18 5v14M6 6l8 6-8 6V6z" /></button>
          <button type="button" className={action.loop ? 'is-active' : ''} onClick={toggleLoop} aria-label={t('循环播放')} title={t('循环播放')}><Icon path="M17 7H7l2-2M7 17h10l-2 2M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7" /></button>
          <label className="editor-fps"><span>{t('帧率')}</span><input type="number" min="1" max="60" value={action.fps} onChange={(event) => setFps(Number(event.target.value))} /></label>
        </div>
      </div>

      <div className="aseprite-main">
        <DrawingCanvas />
        <aside className="aseprite-dock" aria-label={t('工具属性')}>
          <section className="aseprite-dock-panel color-panel">
            <header><strong>{t('颜色')}</strong><span>{t(toolLabel)}</span></header>
            <div className="color-editor-row">
              <input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} aria-label={t('颜色')} />
              <input value={primaryColor} onChange={(event) => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && setPrimaryColor(event.target.value)} aria-label={t('十六进制')} />
            </div>
            <label className="compact-field">
              <span>{t('笔刷大小')}</span>
              <input type="range" min="1" max="32" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              <output>{brushSize}px</output>
            </label>
            <div className="refinement-swatches">
              {paletteColors.map((color, index) => (
                <button key={`${color}:${index}`} type="button" title={color} style={{ backgroundColor: color }} onClick={() => setPrimaryColor(color)} />
              ))}
            </div>
          </section>

          <RefinementLayerPanel />

          <details className="aseprite-dock-panel onion-panel" open>
            <summary>{t('洋葱皮')}</summary>
            <div className="aseprite-dock-body">
              <label className="compact-field"><span>{t('前帧')}</span><input type="number" min="0" max="4" value={onionSkin.before} onChange={(event) => updateOnionSkin({ before: Number(event.target.value) })} /></label>
              <label className="compact-field"><span>{t('后帧')}</span><input type="number" min="0" max="4" value={onionSkin.after} onChange={(event) => updateOnionSkin({ after: Number(event.target.value) })} /></label>
              <label className="compact-field"><span>{t('透明度')}</span><input type="range" min="0.05" max="0.8" step="0.05" value={onionSkin.opacity} onChange={(event) => updateOnionSkin({ opacity: Number(event.target.value) })} /></label>
              <label className="compact-field"><span>{t('前帧颜色')}</span><input type="color" value={onionSkin.beforeColor} onChange={(event) => updateOnionSkin({ beforeColor: event.target.value })} /></label>
              <label className="compact-field"><span>{t('后帧颜色')}</span><input type="color" value={onionSkin.afterColor} onChange={(event) => updateOnionSkin({ afterColor: event.target.value })} /></label>
            </div>
          </details>
        </aside>
      </div>

      <CompactFrameStrip />

      <footer className="editor-bottom-bar">
        <div className="editor-bottom-status">
          <span className={`save-state save-${saveStatus}`}>{saveLabel}</span>
          <span>{refinedFrames > 0 ? t('已有细化') : t('尚未细化')}</span>
        </div>
        <div className="editor-bottom-actions">
          <div className="editor-language-switch" aria-label={t('界面语言')}>
            <button type="button" className={language === 'zh-CN' ? 'is-active' : ''} aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中文</button>
            <button type="button" className={language === 'en' ? 'is-active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
          </div>
          <button type="button" className="editor-toolbar-button" onClick={onExit}>{t('返回预览')}</button>
          <button
            type="button"
            className="editor-toolbar-button"
            data-testid="editor-export-package"
            disabled={packageBusy}
            onClick={() => void exportPackage()}
          >
            {packageBusy ? t('导出中…') : t('导出项目包')}
          </button>
          <button type="button" className="editor-toolbar-button primary" onClick={onSave} disabled={saveStatus === 'saving'} data-testid="editor-save-button">{saveStatus === 'saving' ? t('保存中…') : t('保存')}</button>
        </div>
      </footer>
    </main>
  )
}
