import { useState } from 'react'
import type { AtlasFormat, ExportContentMode } from '../domain/exportManifest'
import type { AssetBundle } from '../domain/types'
import {
  collectExportPlan,
  exportAnimation,
  exportAtlasJson,
  exportEngineManifest,
  exportFrameSequenceZip,
  exportSheetBundle,
  exportSingleFramePng,
  packageFilesAsZip,
  type ExportContext,
  type ExportFile,
  type ExportPlan,
  type ExportScope,
} from '../services/projectExport'
import { getCurrentFrame, useEditorStore } from '../store/editorStore'
import { getFrameEventProjectState } from '../store/frameEventStore'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'
import { useRefinementStore } from '../store/refinementStore'
import { downloadBlob } from '../utils/download'
import { t } from '../i18n'

interface ExportPanelProps {
  bundle: AssetBundle
  projectName: string
}

const ATLAS_FORMATS: Array<{ value: AtlasFormat; label: string }> = [
  { value: 'generic', label: '通用' },
  { value: 'aseprite', label: 'Aseprite' },
  { value: 'texturepacker', label: 'TexturePacker' },
]

/** Reads live project state at export time so a pending edit is never exported from a stale snapshot. */
function buildContext(): ExportContext {
  const project = useProjectStore.getState()
  const refinement = useRefinementStore.getState()
  return {
    palette: activePaletteFromState(project) ?? project.palettePresets[0],
    lighting: project.lighting,
    preferences: project.renderPreferences,
    refinements: refinement.refinements,
    refinementAssets: refinement.assets,
    frameEvents: getFrameEventProjectState(),
  }
}

export function ExportPanel({ bundle, projectName }: ExportPanelProps) {
  const [scope, setScope] = useState<ExportScope>('action')
  const [content, setContent] = useState<ExportContentMode>('composited')
  const [bakePalette, setBakePalette] = useState(true)
  const [bakeLighting, setBakeLighting] = useState(true)
  const [uniformCanvas, setUniformCanvas] = useState(true)
  const [atlasFormat, setAtlasFormat] = useState<AtlasFormat>('generic')
  const [padding, setPadding] = useState(2)
  const [maxWidth, setMaxWidth] = useState(2048)
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()

  const selectedActionId = useEditorStore((state) => state.selectedActionId)
  const currentFrame = useEditorStore((state) =>
    getCurrentFrame({
      bundle: state.bundle,
      selectedActionId: state.selectedActionId,
      currentFrameIndex: state.currentFrameIndex,
    }),
  )

  const exportName = projectName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'sprite-project'

  const buildPlan = (planScope: ExportScope): ExportPlan =>
    collectExportPlan({
      bundle,
      projectName: exportName,
      scope: planScope,
      content,
      bakePalette,
      bakeLighting,
      layout: uniformCanvas ? 'canvas' : 'frame',
      selectedActionId,
      currentFrameId: currentFrame?.id,
    })

  const summary = (() => {
    try {
      const plan = buildPlan(scope)
      const total = plan.frames.reduce((sum, entry) => sum + entry.durationMs, 0)
      const actions = new Set(plan.frames.map((entry) => entry.actionName)).size
      return t('{frames} 帧 · {actions} 个动作 · {duration}ms', {
        frames: plan.frames.length,
        actions,
        duration: Math.round(total),
      })
    } catch {
      return t('请先导入素材。')
    }
  })()

  const run = async (label: string, action: () => Promise<ExportFile[]>) => {
    setBusy(label)
    try {
      const files = await action()
      const file =
        files.length > 1 ? await packageFilesAsZip(files, `${exportName}-${label}.zip`) : files[0]
      if (!file) throw new Error('没有可导出的文件。')
      downloadBlob(file.blob, file.name)
      setMessage(`已导出${label}：${file.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}导出失败。`)
    } finally {
      setBusy(undefined)
    }
  }

  const context = () => buildContext()
  const disabled = busy !== undefined
  const animationDisabled = disabled || scope === 'frame'

  return (
    <section className="inspector-section export-section">
      <div className="section-title-row">
        <strong>{t('精灵导出')}</strong>
        <span className="export-summary">{summary}</span>
      </div>

      <div className="export-options">
        <label className="field">
          <span>{t('导出范围')}</span>
          <select
            data-testid="export-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as ExportScope)}
          >
            <option value="frame">{t('当前帧')}</option>
            <option value="action">{t('当前动作')}</option>
            <option value="project">{t('全部动作')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('导出内容')}</span>
          <select
            data-testid="export-content"
            value={content}
            onChange={(event) => {
              const next = event.target.value as ExportContentMode
              setContent(next)
              setBakePalette(next !== 'source')
              setBakeLighting(next !== 'source')
            }}
          >
            <option value="source">{t('源图')}</option>
            <option value="composited">{t('细化叠加源图')}</option>
            <option value="refinement">{t('仅细化')}</option>
          </select>
        </label>
      </div>

      <div className="export-toggle-grid">
        <label className="checkbox-row">
          <input
            data-testid="export-bake-palette"
            type="checkbox"
            checked={bakePalette}
            onChange={(event) => setBakePalette(event.target.checked)}
          />
          {t('烘焙色板')}
        </label>
        <label className="checkbox-row">
          <input
            data-testid="export-bake-lighting"
            type="checkbox"
            checked={bakeLighting}
            onChange={(event) => setBakeLighting(event.target.checked)}
          />
          {t('烘焙光照')}
        </label>
        <label className="checkbox-row" title={t('开启后所有帧对齐到动作画布，便于引擎播放')}>
          <input
            data-testid="export-uniform-canvas"
            type="checkbox"
            checked={uniformCanvas}
            onChange={(event) => setUniformCanvas(event.target.checked)}
          />
          {t('统一动作画布')}
        </label>
      </div>

      <div className="export-atlas-row">
        <label className="field">
          <span>{t('图集格式')}</span>
          <select
            data-testid="export-atlas-format"
            value={atlasFormat}
            onChange={(event) => setAtlasFormat(event.target.value as AtlasFormat)}
          >
            {ATLAS_FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {t(format.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('图集留白')}</span>
          <input
            data-testid="export-padding"
            type="number"
            min={0}
            max={32}
            value={padding}
            onChange={(event) => setPadding(Math.max(0, Math.min(32, Number(event.target.value) || 0)))}
          />
        </label>
        <label className="field">
          <span>{t('图集最大宽度')}</span>
          <input
            data-testid="export-max-width"
            type="number"
            min={64}
            step={64}
            value={maxWidth}
            onChange={(event) => setMaxWidth(Math.max(64, Number(event.target.value) || 64))}
          />
        </label>
      </div>

      <div className="export-grid">
        <button
          type="button"
          className="button"
          data-testid="export-frame-png"
          disabled={disabled}
          onClick={() =>
            run(t('当前帧 PNG'), () => exportSingleFramePng(buildPlan('frame'), bundle, context()))
          }
        >
          {t('当前帧 PNG')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-sequence-zip"
          disabled={disabled}
          onClick={() =>
            run(t('帧序列 ZIP'), async () => [
              await exportFrameSequenceZip(buildPlan(scope), bundle, context()),
            ])
          }
        >
          {t('帧序列 ZIP')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-sheet-bundle"
          disabled={disabled}
          onClick={() =>
            run(t('图集 PNG + JSON'), () =>
              exportSheetBundle(buildPlan(scope), bundle, context(), {
                format: atlasFormat,
                padding,
                maxWidth,
              }),
            )
          }
        >
          {t('图集 PNG + JSON')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-atlas-json"
          disabled={disabled}
          onClick={() =>
            run(t('图集 JSON'), () =>
              exportAtlasJson(buildPlan(scope), bundle, context(), atlasFormat),
            )
          }
        >
          {t('图集 JSON')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-engine-manifest"
          disabled={disabled}
          onClick={() =>
            run(t('引擎元数据 JSON'), () =>
              exportEngineManifest(buildPlan(scope), bundle, context()),
            )
          }
        >
          {t('引擎元数据 JSON')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-gif"
          title={animationDisabled ? t('选择当前动作或全部动作后可用') : undefined}
          disabled={animationDisabled}
          onClick={() =>
            run(t('GIF 动图'), () => exportAnimation(buildPlan(scope), bundle, context(), 'gif'))
          }
        >
          {t('GIF 动图')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="export-apng"
          title={animationDisabled ? t('选择当前动作或全部动作后可用') : undefined}
          disabled={animationDisabled}
          onClick={() =>
            run(t('APNG 动图'), () => exportAnimation(buildPlan(scope), bundle, context(), 'apng'))
          }
        >
          {t('APNG 动图')}
        </button>
      </div>

      <p className="field-help" data-testid="export-status">
        {busy
          ? t('正在导出 {label}…', { label: busy })
          : message ?? t('序列导出含 manifest.json；图集导出会同时给出图集图片与元数据。')}
      </p>
    </section>
  )
}
