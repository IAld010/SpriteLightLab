import { useMemo, useRef, useState } from 'react'
import {
  createDefaultSpeedCurve,
  createSpeedCurvePreset,
  createSpeedKeyframeId,
  evaluateSpeedCurve,
  insertSpeedKeyframe,
  removeSpeedKeyframe,
  SPEED_CURVE_MAX,
  SPEED_CURVE_MIN,
  updateSpeedKeyframe,
  type SpeedCurvePresetId,
} from '../domain/animationTiming'
import type { SpeedCurve, SpeedKeyframe } from '../domain/types'

const GRAPH_WIDTH = 760
const GRAPH_HEIGHT = 252
const PADDING = { top: 18, right: 20, bottom: 30, left: 48 }
const HANDLE_STEP = 0.08

interface CurveEditorDrawerProps {
  curve: SpeedCurve
  frameCount: number
  currentTime: number
  onChange: (curve: SpeedCurve) => void
  onClose: () => void
}

interface DragState {
  kind: 'key' | 'in' | 'out'
  keyId: string
  originalCurve: SpeedCurve
  rect: DOMRect
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="curve-number-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Number(value.toFixed(4))}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(clamp(next, min, max))
        }}
      />
    </label>
  )
}

export function CurveEditorDrawer({
  curve,
  frameCount,
  currentTime,
  onChange,
  onClose,
}: CurveEditorDrawerProps) {
  const [selectedKeyId, setSelectedKeyId] = useState<string>()
  const [draggedKeyId, setDraggedKeyId] = useState<string>()
  const graphRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | undefined>(undefined)

  const selectedKey =
    curve.keyframes.find((keyframe) => keyframe.id === selectedKeyId) ?? curve.keyframes[0]
  const activeKeyId = selectedKey?.id
  const maxValue = Math.max(4, Math.ceil(Math.max(...curve.keyframes.map((keyframe) => keyframe.value), 1) + 0.5))
  const graphWidth = GRAPH_WIDTH - PADDING.left - PADDING.right
  const graphHeight = GRAPH_HEIGHT - PADDING.top - PADDING.bottom

  const xForTime = (time: number) => PADDING.left + clamp(time, 0, 1) * graphWidth
  const yForValue = (value: number) =>
    PADDING.top + graphHeight - (clamp(value, 0, maxValue) / maxValue) * graphHeight
  const timeForX = (x: number) => clamp((x - PADDING.left) / graphWidth, 0, 1)
  const valueForY = (y: number) =>
    clamp(((PADDING.top + graphHeight - y) / graphHeight) * maxValue, 0, maxValue)

  const curvePath = Array.from({ length: 181 }, (_, index) => {
    const time = index / 180
    const value = evaluateSpeedCurve(curve, time)
    return `${index === 0 ? 'M' : 'L'}${xForTime(time).toFixed(2)},${yForValue(value).toFixed(2)}`
  }).join(' ')

  const frameMarkers = useMemo(() => {
    const count = Math.max(1, frameCount)
    const labelStep = Math.max(1, Math.ceil(count / 12))
    return Array.from({ length: count + 1 }, (_, index) => ({
      time: index / count,
      label: index % labelStep === 0 || index === count ? `${index}` : '',
    }))
  }, [frameCount])

  const valueTicks = Array.from({ length: 5 }, (_, index) => (maxValue * index) / 4)

  const pointerToGraph = (clientX: number, clientY: number, rect: DOMRect) => ({
    x: (clientX - rect.left) * (GRAPH_WIDTH / Math.max(1, rect.width)),
    y: (clientY - rect.top) * (GRAPH_HEIGHT / Math.max(1, rect.height)),
  })

  const beginKeyDrag = (event: React.PointerEvent<SVGElement>, keyframe: SpeedKeyframe) => {
    event.stopPropagation()
    const graph = graphRef.current
    if (!graph) return
    const rect = graph.getBoundingClientRect()
    graph.setPointerCapture(event.pointerId)
    setSelectedKeyId(keyframe.id)
    setDraggedKeyId(keyframe.id)
    dragRef.current = {
      kind: 'key',
      keyId: keyframe.id,
      originalCurve: curve,
      rect,
    }
  }

  const beginTangentDrag = (
    event: React.PointerEvent<SVGElement>,
    keyframe: SpeedKeyframe,
    kind: 'in' | 'out',
  ) => {
    event.stopPropagation()
    const graph = graphRef.current
    if (!graph) return
    const rect = graph.getBoundingClientRect()
    graph.setPointerCapture(event.pointerId)
    setSelectedKeyId(keyframe.id)
    setDraggedKeyId(keyframe.id)
    dragRef.current = {
      kind,
      keyId: keyframe.id,
      originalCurve: curve,
      rect,
    }
  }

  return (
    <aside className="curve-editor-drawer" aria-label="速度曲线编辑器">
      <header className="curve-editor-header">
        <div>
          <strong>速度曲线</strong>
          <span>横轴为动作时间，纵轴为速度倍率；曲线越高，该段播放越快。</span>
        </div>
        <div className="curve-editor-actions">
          <label className="curve-select-field">
            <span>预设</span>
            <select
              defaultValue=""
              onChange={(event) => {
                const preset = event.target.value as SpeedCurvePresetId
                if (!preset) return
                onChange(createSpeedCurvePreset(preset))
                setSelectedKeyId(undefined)
                event.currentTarget.value = ''
              }}
            >
              <option value="">选择预设</option>
              <option value="constant">匀速</option>
              <option value="ease-in">缓入加速</option>
              <option value="ease-out">缓出减速</option>
              <option value="ease-in-out">缓入缓出</option>
              <option value="impact">冲击节奏</option>
            </select>
          </label>
          <label className="curve-checkbox">
            <input
              type="checkbox"
              checked={curve.preserveTotalDuration}
              onChange={(event) =>
                onChange({ ...curve, preserveTotalDuration: event.target.checked })
              }
            />
            保持总时长
          </label>
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              onChange(createDefaultSpeedCurve())
              setSelectedKeyId(undefined)
            }}
          >
            重置
          </button>
          <button type="button" className="mini-button" onClick={onClose}>
            关闭
          </button>
        </div>
      </header>

      <div className="curve-editor-body">
        <div className="curve-graph-shell">
          <svg
            ref={graphRef}
            className="curve-graph"
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            role="img"
            aria-label="速度曲线图，双击可添加关键帧"
            onDoubleClick={(event) => {
              if ((event.target as SVGElement).closest('[data-curve-control="true"]')) return
              const graph = graphRef.current
              if (!graph) return
              const rect = graph.getBoundingClientRect()
              const point = pointerToGraph(event.clientX, event.clientY, rect)
              const time = timeForX(point.x)
              const value = clamp(valueForY(point.y), SPEED_CURVE_MIN, SPEED_CURVE_MAX)
              const existing = curve.keyframes.find(
                (keyframe) => Math.abs(xForTime(keyframe.time) - point.x) < 8,
              )
              if (existing) {
                setSelectedKeyId(existing.id)
                return
              }
              const keyframe: SpeedKeyframe = {
                id: createSpeedKeyframeId(),
                time,
                value,
                inTangent: 0,
                outTangent: 0,
                interpolation: 'smooth',
              }
              onChange(insertSpeedKeyframe(curve, keyframe))
              setSelectedKeyId(keyframe.id)
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag) return
              const point = pointerToGraph(event.clientX, event.clientY, drag.rect)
              const originalKey = drag.originalCurve.keyframes.find(
                (keyframe) => keyframe.id === drag.keyId,
              )
              if (!originalKey) return

              if (drag.kind === 'key') {
                const index = drag.originalCurve.keyframes.findIndex(
                  (keyframe) => keyframe.id === drag.keyId,
                )
                const previous = drag.originalCurve.keyframes[index - 1]
                const next = drag.originalCurve.keyframes[index + 1]
                const minTime = previous ? previous.time + 0.002 : 0
                const maxTime = next ? next.time - 0.002 : 1
                const time =
                  index === 0 ? 0 : index === drag.originalCurve.keyframes.length - 1 ? 1 : clamp(timeForX(point.x), minTime, maxTime)
                const value = clamp(valueForY(point.y), SPEED_CURVE_MIN, SPEED_CURVE_MAX)
                onChange(updateSpeedKeyframe(drag.originalCurve, drag.keyId, { time, value }))
                return
              }

              const handleSpace = drag.kind === 'out'
                ? Math.max(0.02, Math.min(HANDLE_STEP, 1 - originalKey.time))
                : Math.max(0.02, Math.min(HANDLE_STEP, originalKey.time))
              const pointerValue = clamp(valueForY(point.y), 0, maxValue)
              const tangent =
                drag.kind === 'out'
                  ? (pointerValue - originalKey.value) / handleSpace
                  : (originalKey.value - pointerValue) / handleSpace
              onChange(
                updateSpeedKeyframe(drag.originalCurve, drag.keyId, {
                  [drag.kind === 'out' ? 'outTangent' : 'inTangent']: clamp(
                    tangent,
                    -SPEED_CURVE_MAX * 4,
                    SPEED_CURVE_MAX * 4,
                  ),
                }),
              )
            }}
            onPointerUp={(event) => {
              if (graphRef.current?.hasPointerCapture(event.pointerId)) {
                graphRef.current.releasePointerCapture(event.pointerId)
              }
              dragRef.current = undefined
              setDraggedKeyId(undefined)
            }}
            onPointerCancel={() => {
              dragRef.current = undefined
              setDraggedKeyId(undefined)
            }}
          >
            <rect
              x="0"
              y="0"
              width={GRAPH_WIDTH}
              height={GRAPH_HEIGHT}
              fill="transparent"
            />

            {valueTicks.map((value) => (
              <g key={`value:${value}`}>
                <line
                  className="curve-grid-line"
                  x1={PADDING.left}
                  x2={GRAPH_WIDTH - PADDING.right}
                  y1={yForValue(value)}
                  y2={yForValue(value)}
                />
                <text
                  className="curve-axis-label"
                  x={PADDING.left - 8}
                  y={yForValue(value) + 3}
                  textAnchor="end"
                >
                  {Number(value.toFixed(2))}×
                </text>
              </g>
            ))}

            {frameMarkers.map((marker, index) => (
              <g key={`frame:${index}`}>
                <line
                  className={index === 0 || index === frameMarkers.length - 1 ? 'curve-frame-line is-edge' : 'curve-frame-line'}
                  x1={xForTime(marker.time)}
                  x2={xForTime(marker.time)}
                  y1={PADDING.top}
                  y2={PADDING.top + graphHeight}
                />
                {marker.label && (
                  <text
                    className="curve-frame-label"
                    x={xForTime(marker.time)}
                    y={GRAPH_HEIGHT - 8}
                    textAnchor="middle"
                  >
                    {marker.label}
                  </text>
                )}
              </g>
            ))}

            <line
              className="curve-baseline"
              x1={PADDING.left}
              x2={GRAPH_WIDTH - PADDING.right}
              y1={yForValue(1)}
              y2={yForValue(1)}
            />
            <line
              className="curve-playhead"
              x1={xForTime(currentTime)}
              x2={xForTime(currentTime)}
              y1={PADDING.top}
              y2={PADDING.top + graphHeight}
            />

            <path className="curve-main-path" d={curvePath} />

            {curve.keyframes.map((keyframe) => {
              const x = xForTime(keyframe.time)
              const y = yForValue(keyframe.value)
              const active = keyframe.id === activeKeyId
              const dragging = keyframe.id === draggedKeyId
              const handles =
                keyframe.interpolation === 'smooth'
                  ? [
                      ...(keyframe.time > 0.001
                        ? [
                            {
                              side: 'in' as const,
                              x: xForTime(Math.max(0, keyframe.time - HANDLE_STEP)),
                              y: yForValue(keyframe.value + keyframe.inTangent * -HANDLE_STEP),
                            },
                          ]
                        : []),
                      ...(keyframe.time < 0.999
                        ? [
                            {
                              side: 'out' as const,
                              x: xForTime(Math.min(1, keyframe.time + HANDLE_STEP)),
                              y: yForValue(keyframe.value + keyframe.outTangent * HANDLE_STEP),
                            },
                          ]
                        : []),
                    ]
                  : []
              return (
                <g key={keyframe.id}>
                  {handles.map((handle) => (
                    <g key={handle.side} data-curve-control="true">
                      <line
                        className="curve-tangent-line"
                        x1={x}
                        y1={y}
                        x2={handle.x}
                        y2={handle.y}
                      />
                      <circle
                        className={`curve-tangent-handle ${active ? 'is-active' : ''}`}
                        cx={handle.x}
                        cy={handle.y}
                        r="4"
                        onPointerDown={(event) => beginTangentDrag(event, keyframe, handle.side)}
                      />
                    </g>
                  ))}
                  <path
                    data-curve-control="true"
                    className={`curve-keyframe ${active ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''}`}
                    d={`M${x},${y - 6} L${x + 6},${y} L${x},${y + 6} L${x - 6},${y} Z`}
                    onPointerDown={(event) => beginKeyDrag(event, keyframe)}
                  />
                </g>
              )
            })}
          </svg>
          <div className="curve-graph-hint">双击空白处添加关键帧；拖动菱形改时间和速度；拖动圆点调整切线。</div>
        </div>

        <aside className="curve-keyframe-inspector">
          <div className="curve-inspector-heading">
            <strong>关键帧</strong>
            <span>{curve.keyframes.length} 个</span>
          </div>
          {selectedKey ? (
            <>
              <div className="curve-number-grid">
                <NumberField
                  label="时间 %"
                  min={0}
                  max={100}
                  step={0.1}
                  disabled={selectedKey.time === 0 || selectedKey.time === 1}
                  value={selectedKey.time * 100}
                  onChange={(value) =>
                    onChange(updateSpeedKeyframe(curve, selectedKey.id, { time: value / 100 }))
                  }
                />
                <NumberField
                  label="速度 ×"
                  min={SPEED_CURVE_MIN}
                  max={SPEED_CURVE_MAX}
                  step={0.05}
                  value={selectedKey.value}
                  onChange={(value) =>
                    onChange(updateSpeedKeyframe(curve, selectedKey.id, { value }))
                  }
                />
                <NumberField
                  label="入切线"
                  min={-SPEED_CURVE_MAX * 4}
                  max={SPEED_CURVE_MAX * 4}
                  step={0.05}
                  disabled={selectedKey.interpolation !== 'smooth'}
                  value={selectedKey.inTangent}
                  onChange={(value) =>
                    onChange(updateSpeedKeyframe(curve, selectedKey.id, { inTangent: value }))
                  }
                />
                <NumberField
                  label="出切线"
                  min={-SPEED_CURVE_MAX * 4}
                  max={SPEED_CURVE_MAX * 4}
                  step={0.05}
                  disabled={selectedKey.interpolation !== 'smooth'}
                  value={selectedKey.outTangent}
                  onChange={(value) =>
                    onChange(updateSpeedKeyframe(curve, selectedKey.id, { outTangent: value }))
                  }
                />
              </div>
              <label className="field compact-field">
                <span>关键帧插值</span>
                <select
                  value={selectedKey.interpolation}
                  onChange={(event) =>
                    onChange(
                      updateSpeedKeyframe(curve, selectedKey.id, {
                        interpolation: event.target.value as SpeedKeyframe['interpolation'],
                      }),
                    )
                  }
                >
                  <option value="smooth">平滑</option>
                  <option value="linear">线性</option>
                  <option value="stepped">阶梯</option>
                </select>
              </label>
              <button
                type="button"
                className="button curve-delete-key"
                disabled={selectedKey.time === 0 || selectedKey.time === 1}
                onClick={() => {
                  onChange(removeSpeedKeyframe(curve, selectedKey.id))
                  setSelectedKeyId(undefined)
                }}
              >
                删除当前关键帧
              </button>
            </>
          ) : (
            <p className="field-help">选择一个关键帧后可编辑精确数值。</p>
          )}
          <div className="curve-summary-card">
            <strong>{curve.preserveTotalDuration ? '保持总时长' : '允许总时长变化'}</strong>
            <span>帧格中的时长和速度倍率会实时更新。</span>
          </div>
        </aside>
      </div>
    </aside>
  )
}