import type {
  AnimationClip,
  PreviewFrame,
  SpeedCurve,
  SpeedKeyframe,
  SpeedKeyInterpolation,
} from './types'

export const SPEED_CURVE_MIN = 0.05
export const SPEED_CURVE_MAX = 16
const MIN_FRAME_DURATION_MS = 1
const MIN_FPS = 1
const MAX_FPS = 60

export interface FrameScheduleEntry {
  frameId: string
  baseDurationMs: number
  speedMultiplier: number
  durationMs: number
  startTimeMs: number
  endTimeMs: number
}

export interface AnimationFrameSchedule {
  frames: FrameScheduleEntry[]
  totalDurationMs: number
  baseDurationMs: number
  curve: SpeedCurve
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function normalizeInterpolation(value: unknown): SpeedKeyInterpolation {
  return value === 'linear' || value === 'stepped' || value === 'smooth'
    ? value
    : 'smooth'
}

function normalizeKeyframe(keyframe: SpeedKeyframe, index: number): SpeedKeyframe {
  return {
    id: keyframe.id || `speed-key:${index}`,
    time: clamp(finiteOr(keyframe.time, 0), 0, 1),
    value: clamp(finiteOr(keyframe.value, 1), SPEED_CURVE_MIN, SPEED_CURVE_MAX),
    inTangent: clamp(finiteOr(keyframe.inTangent, 0), -SPEED_CURVE_MAX * 4, SPEED_CURVE_MAX * 4),
    outTangent: clamp(finiteOr(keyframe.outTangent, 0), -SPEED_CURVE_MAX * 4, SPEED_CURVE_MAX * 4),
    interpolation: normalizeInterpolation(keyframe.interpolation),
  }
}

export type SpeedCurvePresetId =
  | 'constant'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'impact'

function presetKeyframe(
  id: string,
  time: number,
  value: number,
  interpolation: SpeedKeyframe['interpolation'] = 'smooth',
): SpeedKeyframe {
  return {
    id,
    time,
    value,
    inTangent: 0,
    outTangent: 0,
    interpolation,
  }
}

export function createSpeedKeyframeId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `speed-key:${random}`
}

export function createSpeedCurvePreset(preset: SpeedCurvePresetId): SpeedCurve {
  const keyframes = (() => {
    switch (preset) {
      case 'ease-in':
        return [
          presetKeyframe('speed-key:start', 0, 0.5),
          presetKeyframe('speed-key:end', 1, 2),
        ]
      case 'ease-out':
        return [
          presetKeyframe('speed-key:start', 0, 2),
          presetKeyframe('speed-key:end', 1, 0.5),
        ]
      case 'ease-in-out':
        return [
          presetKeyframe('speed-key:start', 0, 0.5),
          presetKeyframe('speed-key:peak', 0.5, 2),
          presetKeyframe('speed-key:end', 1, 0.5),
        ]
      case 'impact':
        return [
          presetKeyframe('speed-key:start', 0, 0.6),
          presetKeyframe('speed-key:windup', 0.18, 3),
          presetKeyframe('speed-key:recover', 0.45, 1.1),
          presetKeyframe('speed-key:end', 1, 0.5),
        ]
      case 'constant':
      default:
        return createDefaultSpeedCurve().keyframes
    }
  })()

  return {
    version: 1,
    preserveTotalDuration: true,
    keyframes,
  }
}

export function insertSpeedKeyframe(curve: SpeedCurve, keyframe: SpeedKeyframe): SpeedCurve {
  const normalized = normalizeSpeedCurve(curve)
  return normalizeSpeedCurve({
    ...normalized,
    keyframes: [
      ...normalized.keyframes.filter((candidate) => candidate.id !== keyframe.id),
      keyframe,
    ],
  })
}

export function updateSpeedKeyframe(
  curve: SpeedCurve,
  keyframeId: string,
  patch: Partial<SpeedKeyframe>,
): SpeedCurve {
  const normalized = normalizeSpeedCurve(curve)
  return normalizeSpeedCurve({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) =>
      keyframe.id === keyframeId ? { ...keyframe, ...patch } : keyframe,
    ),
  })
}

export function removeSpeedKeyframe(curve: SpeedCurve, keyframeId: string): SpeedCurve {
  const normalized = normalizeSpeedCurve(curve)
  return normalizeSpeedCurve({
    ...normalized,
    keyframes: normalized.keyframes.filter((keyframe) => keyframe.id !== keyframeId),
  })
}
export function createDefaultSpeedCurve(): SpeedCurve {
  return {
    version: 1,
    preserveTotalDuration: true,
    keyframes: [
      {
        id: 'speed-key:start',
        time: 0,
        value: 1,
        inTangent: 0,
        outTangent: 0,
        interpolation: 'smooth',
      },
      {
        id: 'speed-key:end',
        time: 1,
        value: 1,
        inTangent: 0,
        outTangent: 0,
        interpolation: 'smooth',
      },
    ],
  }
}

export function normalizeSpeedCurve(curve?: SpeedCurve): SpeedCurve {
  const fallback = createDefaultSpeedCurve()
  const source = curve?.keyframes?.length ? curve.keyframes : fallback.keyframes
  const sorted = source
    .map(normalizeKeyframe)
    .sort((left, right) => left.time - right.time)

  const unique: SpeedKeyframe[] = []
  for (const keyframe of sorted) {
    const previous = unique[unique.length - 1]
    if (previous && Math.abs(previous.time - keyframe.time) < 1e-7) {
      unique[unique.length - 1] = keyframe
    } else {
      unique.push(keyframe)
    }
  }

  if (unique.length === 0) {
    return fallback
  }

  const first = unique[0]
  if (first.time > 0) {
    unique.unshift({ ...first, id: 'speed-key:start', time: 0, inTangent: 0, outTangent: 0 })
  }

  const last = unique[unique.length - 1]
  if (last.time < 1) {
    unique.push({ ...last, id: 'speed-key:end', time: 1, inTangent: 0, outTangent: 0 })
  }

  return {
    version: 1,
    preserveTotalDuration: curve?.preserveTotalDuration ?? true,
    keyframes: unique,
  }
}

function evaluateNormalizedSpeedCurve(curve: SpeedCurve, time: number): number {
  const keyframes = curve.keyframes
  const sampleTime = clamp(finiteOr(time, 0), 0, 1)
  if (keyframes.length === 0) return 1

  for (const keyframe of keyframes) {
    if (Math.abs(keyframe.time - sampleTime) < 1e-7) {
      return keyframe.value
    }
  }

  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (sampleTime < first.time) return first.value
  if (sampleTime > last.time) return last.value

  let left = first
  let right = last
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const candidate = keyframes[index]
    const next = keyframes[index + 1]
    if (sampleTime > candidate.time && sampleTime < next.time) {
      left = candidate
      right = next
      break
    }
  }

  const span = right.time - left.time
  if (span <= 1e-7) return right.value
  const t = (sampleTime - left.time) / span

  if (left.interpolation === 'stepped') {
    return left.value
  }
  if (left.interpolation === 'linear') {
    return clamp(left.value + (right.value - left.value) * t, SPEED_CURVE_MIN, SPEED_CURVE_MAX)
  }

  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  const value =
    h00 * left.value +
    h10 * span * left.outTangent +
    h01 * right.value +
    h11 * span * right.inTangent
  return clamp(value, SPEED_CURVE_MIN, SPEED_CURVE_MAX)
}

export function evaluateSpeedCurve(curve: SpeedCurve | undefined, time: number): number {
  return evaluateNormalizedSpeedCurve(normalizeSpeedCurve(curve), time)
}

function baseDurationForFrame(frame: PreviewFrame | undefined, fps: number): number {
  const duration = frame?.durationMs
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
    return Math.max(MIN_FRAME_DURATION_MS, duration)
  }
  const safeFps = clamp(finiteOr(fps, 8), MIN_FPS, MAX_FPS)
  return 1000 / safeFps
}

export function computeFrameSchedule(
  action: AnimationClip,
  frames: PreviewFrame[],
): AnimationFrameSchedule {
  const curve = normalizeSpeedCurve(action.timing?.speedCurve)
  const baseDurations = frames.map((frame) => baseDurationForFrame(frame, action.fps))
  const baseDurationMs = baseDurations.reduce((sum, duration) => sum + duration, 0)

  if (frames.length === 0) {
    return {
      frames: [],
      totalDurationMs: 0,
      baseDurationMs: 0,
      curve,
    }
  }

  const rawDurations = baseDurations.map((baseDuration, index) => {
    const normalizedTime = frames.length === 1 ? 0.5 : (index + 0.5) / frames.length
    const speed = evaluateNormalizedSpeedCurve(curve, normalizedTime)
    return Math.max(MIN_FRAME_DURATION_MS, baseDuration / speed)
  })

  const rawTotal = rawDurations.reduce((sum, duration) => sum + duration, 0)
  const preservationScale =
    curve.preserveTotalDuration && rawTotal > 0 && baseDurationMs > 0
      ? baseDurationMs / rawTotal
      : 1

  let elapsed = 0
  const scheduled = rawDurations.map((rawDuration, index) => {
    const durationMs = Math.max(MIN_FRAME_DURATION_MS, rawDuration * preservationScale)
    const startTimeMs = elapsed
    elapsed += durationMs
    return {
      frameId: frames[index].id,
      baseDurationMs: baseDurations[index],
      speedMultiplier: baseDurations[index] / durationMs,
      durationMs,
      startTimeMs,
      endTimeMs: elapsed,
    } satisfies FrameScheduleEntry
  })

  return {
    frames: scheduled,
    totalDurationMs: elapsed,
    baseDurationMs,
    curve,
  }
}