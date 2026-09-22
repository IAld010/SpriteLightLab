import { useEffect, useMemo, useRef, useState } from 'react'
import { computeFrameSchedule } from '../domain/animationTiming'
import { CurveEditorDrawer } from './CurveEditorDrawer'
import type { AssetBundle, PreviewFrame } from '../domain/types'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { markInternalDrag } from '../utils/dragAndDrop'
import { getSelectedAction, useEditorStore } from '../store/editorStore'
import { t } from '../i18n'

const THUMBNAIL_WIDTH = 48
const THUMBNAIL_HEIGHT = 36

function formatDuration(durationMs: number): string {
  if (durationMs >= 1000) {
    const seconds = durationMs / 1000
    return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 2)}s`
  }
  return `${Math.round(durationMs)}ms`
}

function pairDescription(frame: PreviewFrame): string {
  if (frame.normal) {
    return frame.pairingStatus === 'manual' ? t('手工配对法线图') : t('已配对法线图')
  }
  return frame.pairingStatus === 'mismatch' ? t('图集布局不匹配') : t('缺少法线图')
}

function FrameThumbnail({ frame, bundle }: { frame: PreviewFrame; bundle: AssetBundle }) {
  const image = bundle.images.find((candidate) => candidate.id === frame.source.imageId)
  const imageUrl = useObjectUrl(image?.file)
  const rect = frame.source.rect ?? {
    x: 0,
    y: 0,
    width: image?.width ?? 1,
    height: image?.height ?? 1,
  }
  const scale = Math.min(
    THUMBNAIL_WIDTH / Math.max(1, rect.width),
    THUMBNAIL_HEIGHT / Math.max(1, rect.height),
  )
  const width = (image?.width ?? rect.width) * scale
  const height = (image?.height ?? rect.height) * scale
  const left = (THUMBNAIL_WIDTH - rect.width * scale) / 2 - rect.x * scale
  const top = (THUMBNAIL_HEIGHT - rect.height * scale) / 2 - rect.y * scale

  return (
    <span className="timeline-thumbnail" aria-hidden="true">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{ width, height, left, top }}
        />
      ) : (
        <span className="timeline-thumbnail-empty">NO IMG</span>
      )}
    </span>
  )
}

export function Timeline() {
  const bundle = useEditorStore((state) => state.bundle)
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const zoom = useEditorStore((state) => state.settings.zoom)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const stepFrame = useEditorStore((state) => state.stepFrame)
  const selectFrame = useEditorStore((state) => state.selectFrame)
  const toggleLoop = useEditorStore((state) => state.toggleLoop)
  const setFps = useEditorStore((state) => state.setFps)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetView = useEditorStore((state) => state.resetView)
  const reorderFrames = useEditorStore((state) => state.reorderFrames)
  const updateSpeedCurve = useEditorStore((state) => state.updateSpeedCurve)
  const activeCellRef = useRef<HTMLButtonElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number>()
  const [dropIndex, setDropIndex] = useState<number>()
  const [curveEditorOpen, setCurveEditorOpen] = useState(false)

  const frames = useMemo(() => {
    if (!bundle || !action) return []
    return action.frameIds.flatMap((frameId) => {
      const frame = bundle.frames.find((candidate) => candidate.id === frameId)
      return frame ? [frame] : []
    })
  }, [action, bundle])

  const schedule = useMemo(
    () => (action ? computeFrameSchedule(action, frames) : undefined),
    [action, frames],
  )
  const scheduleByFrameId = useMemo(
    () => new Map(schedule?.frames.map((entry) => [entry.frameId, entry]) ?? []),
    [schedule],
  )

  useEffect(() => {
    activeCellRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [action?.id, currentFrameIndex])

  const currentScheduleEntry = schedule?.frames[currentFrameIndex]
  const currentTime =
    currentScheduleEntry && schedule && schedule.totalDurationMs > 0
      ? (currentScheduleEntry.startTimeMs + currentScheduleEntry.durationMs / 2) /
        schedule.totalDurationMs
      : 0

  if (!bundle || !action || !schedule) {
    return (
      <footer className="timeline timeline-empty">
        <span>{t('播放控制与帧时间线将在导入素材后启用。')}</span>
      </footer>
    )
  }
  const selectRelativeFrame = (index: number) => {
    const frame = frames[index]
    if (frame) selectFrame(frame.id)
  }

  return (
    <footer className="timeline">
      <div className="timeline-toolbar">
        <div className="transport">
          <button
            type="button"
            className="transport-button"
            onClick={() => stepFrame(-1)}
            aria-label={t('上一帧')}
          >
            │◀
          </button>
          <button
            type="button"
            className={`transport-button play-button ${isPlaying ? 'is-active' : ''}`}
            onClick={() => setPlaying(!isPlaying)}
            aria-label={isPlaying ? t('暂停') : t('播放')}
          >
            {isPlaying ? 'Ⅱ' : '▶'}
          </button>
          <button
            type="button"
            className="transport-button"
            onClick={() => stepFrame(1)}
            aria-label={t('下一帧')}
          >
            ▶│
          </button>
          <button
            type="button"
            className="transport-button"
            onClick={resetView}
            aria-label={t('居中显示')}
          >
            ⌖
          </button>
          <button
            type="button"
            className={`transport-button loop-button ${action.loop ? 'is-active' : ''}`}
            onClick={toggleLoop}
            aria-label={t('循环播放')}
          >
            ↻
          </button>
        </div>

        <div className="timeline-summary">
          <strong title={action.name}>{action.name}</strong>
          <span>{t('{count} 帧', { count: frames.length })}</span>
          <span>{formatDuration(schedule.totalDurationMs)}</span>
          <span>{Math.min(frames.length, currentFrameIndex + 1)} / {frames.length}</span>
          <small>{t('拖动帧格可调整顺序')}</small>
        </div>

        <div className="timeline-settings">
          <button
            type="button"
            className={`curve-editor-toggle ${curveEditorOpen ? 'is-active' : ''}`}
            aria-expanded={curveEditorOpen}
            onClick={() => setCurveEditorOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 18 C7 18 7 6 12 6 S17 18 21 18" />
            </svg>
            {t('速度曲线')}
          </button>
          <label className="compact-control">
            <span>{t('帧率')}</span>
            <input
              type="number"
              min="1"
              max="60"
              value={action.fps}
              onChange={(event) => setFps(Number(event.target.value))}
            />
          </label>
          <label className="zoom-control">
            <span>{t('缩放')}</span>
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <output>{Math.round(zoom * 100)}%</output>
          </label>
        </div>
      </div>

      <div className="timeline-track-shell">
        <div className="timeline-track-label">
          <strong>{t('帧')}</strong>
          <span>{t('固定格')}</span>
        </div>
        <div className="frame-track" role="list" aria-label={t('帧时间线')}>
          {frames.map((frame, index) => {
            const active = index === currentFrameIndex
            const timing = scheduleByFrameId.get(frame.id)
            return (
              <button
                type="button"
                role="listitem"
                ref={active ? activeCellRef : undefined}
                key={frame.id}
                draggable
                aria-current={active ? 'true' : undefined}
                aria-label={t('第 {index} 帧：{name}', { index: index + 1, name: frame.name })}
                className={`timeline-frame-cell ${active ? 'is-active' : ''} ${
                  dropIndex === index && draggedIndex !== index ? 'is-drop-target' : ''
                }`}
                title={`${frame.name} · ${formatDuration(timing?.durationMs ?? 0)} · ${pairDescription(frame)}`}
                onClick={() => selectFrame(frame.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    selectRelativeFrame(index - 1)
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    selectRelativeFrame(index + 1)
                  } else if (event.key === 'Home') {
                    event.preventDefault()
                    selectRelativeFrame(0)
                  } else if (event.key === 'End') {
                    event.preventDefault()
                    selectRelativeFrame(frames.length - 1)
                  }
                }}
                onDragStart={(event) => { markInternalDrag(event); setDraggedIndex(index) }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDropIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggedIndex !== undefined) {
                    reorderFrames(action.id, draggedIndex, index)
                  }
                  setDraggedIndex(undefined)
                  setDropIndex(undefined)
                }}
                onDragEnd={() => {
                  setDraggedIndex(undefined)
                  setDropIndex(undefined)
                }}
              >
                <span className="timeline-cell-head">
                  <span className="timeline-frame-number">{String(index + 1).padStart(2, '0')}</span>
                  <span
                    className={`pair-dot pair-${frame.pairingStatus}`}
                    title={pairDescription(frame)}
                  />
                </span>
                <FrameThumbnail frame={frame} bundle={bundle} />
                <span className="timeline-cell-foot">
                  <span className="timeline-frame-duration">{formatDuration(timing?.durationMs ?? 0)}</span>
                  <span className="timeline-frame-speed">
                    {timing ? `${timing.speedMultiplier.toFixed(2)}×` : '—'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {curveEditorOpen && (
        <CurveEditorDrawer
          curve={schedule.curve}
          frameCount={frames.length}
          currentTime={currentTime}
          onChange={(curve) => updateSpeedCurve(action.id, curve)}
          onClose={() => setCurveEditorOpen(false)}
        />
      )}
    </footer>
  )
}
