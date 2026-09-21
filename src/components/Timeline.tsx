import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'

export function Timeline() {
  const bundle = useEditorStore((state) => state.bundle)
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
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

  if (!bundle || !action) {
    return (
      <footer className="timeline timeline-empty">
        <span>播放控制与帧时间线将在导入素材后启用。</span>
      </footer>
    )
  }

  const frames = action.frameIds.flatMap((frameId) => {
    const frame = bundle.frames.find((candidate) => candidate.id === frameId)
    return frame ? [frame] : []
  })

  return (
    <footer className="timeline">
      <div className="transport">
        <button
          type="button"
          className="transport-button"
          onClick={() => stepFrame(-1)}
          aria-label="上一帧"
        >
          │◀
        </button>
        <button
          type="button"
          className={`transport-button play-button ${isPlaying ? 'is-active' : ''}`}
          onClick={() => setPlaying(!isPlaying)}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <button
          type="button"
          className="transport-button"
          onClick={() => stepFrame(1)}
          aria-label="下一帧"
        >
          ▶│
        </button>
        <button
          type="button"
          className="transport-button"
          onClick={resetView}
          aria-label="\u5c45\u4e2d\u663e\u793a"
        >
          ?
        </button>
        <button
          type="button"
          className={`transport-button loop-button ${action.loop ? 'is-active' : ''}`}
          onClick={toggleLoop}
          aria-label="循环播放"
        >
          ↻
        </button>
      </div>

      <div className="frame-track" role="list" aria-label="帧时间线">
        {frames.map((frame, index) => (
          <button
            type="button"
            role="listitem"
            key={frame.id}
            className={`timeline-frame ${
              currentFrame?.id === frame.id || index === currentFrameIndex ? 'is-active' : ''
            }`}
            onClick={() => selectFrame(frame.id)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <small>{frame.name}</small>
          </button>
        ))}
      </div>

      <div className="timeline-settings">
        <label className="compact-control">
          <span>帧率</span>
          <input
            type="number"
            min="1"
            max="60"
            value={action.fps}
            onChange={(event) => setFps(Number(event.target.value))}
          />
        </label>
        <label className="zoom-control">
          <span>缩放</span>
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
    </footer>
  )
}