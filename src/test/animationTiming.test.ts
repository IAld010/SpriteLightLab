import { describe, expect, it } from 'vitest'
import {
  computeFrameSchedule,
  createDefaultSpeedCurve,
  createSpeedCurvePreset,
  createSpeedKeyframeId,
  insertSpeedKeyframe,
  removeSpeedKeyframe,
  evaluateSpeedCurve,
  updateSpeedKeyframe,
} from '../domain/animationTiming'
import type { AnimationClip, PreviewFrame, SpeedCurve } from '../domain/types'

function frame(id: string, durationMs?: number): PreviewFrame {
  return {
    id,
    name: id,
    source: { id: `source:${id}`, name: `${id}.png`, imageId: 'image:1' },
    pairingStatus: 'missing',
    ...(durationMs === undefined ? {} : { durationMs }),
  }
}

function action(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: 'clip:test',
    name: 'test',
    frameIds: ['frame:1', 'frame:2', 'frame:3'],
    fps: 8,
    loop: true,
    ...overrides,
  }
}

describe('speed curve evaluation', () => {
  it('creates a neutral multi-key curve', () => {
    const curve = createDefaultSpeedCurve()

    expect(curve.keyframes.length).toBeGreaterThanOrEqual(2)
    expect(evaluateSpeedCurve(curve, 0)).toBe(1)
    expect(evaluateSpeedCurve(curve, 0.5)).toBeCloseTo(1, 10)
    expect(evaluateSpeedCurve(curve, 1)).toBe(1)
  })

  it('evaluates smooth keyframes with independent in and out tangents', () => {
    const curve: SpeedCurve = {
      version: 1,
      preserveTotalDuration: true,
      keyframes: [
        {
          id: 'key:start',
          time: 0,
          value: 1,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'smooth',
        },
        {
          id: 'key:end',
          time: 1,
          value: 2,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'smooth',
        },
      ],
    }

    expect(evaluateSpeedCurve(curve, 0.5)).toBeCloseTo(1.5, 10)
  })
})

describe('speed curve editing', () => {
  it('creates editable presets with multiple keyframes', () => {
    const curve = createSpeedCurvePreset('ease-in-out')

    expect(curve.keyframes.length).toBeGreaterThanOrEqual(3)
    expect(curve.preserveTotalDuration).toBe(true)
    expect(curve.keyframes[1].value).toBeGreaterThan(1)
  })

  it('inserts, updates and removes interior keyframes', () => {
    const id = createSpeedKeyframeId()
    const inserted = insertSpeedKeyframe(createDefaultSpeedCurve(), {
      id,
      time: 0.5,
      value: 1.5,
      inTangent: 0,
      outTangent: 0,
      interpolation: 'smooth',
    })
    expect(inserted.keyframes).toHaveLength(3)

    const updated = updateSpeedKeyframe(inserted, id, { value: 2, interpolation: 'linear' })
    expect(updated.keyframes.find((keyframe) => keyframe.id === id)?.value).toBe(2)
    expect(updated.keyframes.find((keyframe) => keyframe.id === id)?.interpolation).toBe('linear')

    const removed = removeSpeedKeyframe(updated, id)
    expect(removed.keyframes.some((keyframe) => keyframe.id === id)).toBe(false)
    expect(removed.keyframes[0].time).toBe(0)
    expect(removed.keyframes[removed.keyframes.length - 1].time).toBe(1)
  })
})
describe('animation frame schedule', () => {
  it('uses equal FPS timing when no per-frame duration or custom curve exists', () => {
    const schedule = computeFrameSchedule(
      action(),
      [frame('frame:1'), frame('frame:2'), frame('frame:3')],
    )

    expect(schedule.frames.map((item) => item.durationMs)).toEqual([125, 125, 125])
    expect(schedule.totalDurationMs).toBe(375)
  })

  it('preserves imported per-frame durations', () => {
    const schedule = computeFrameSchedule(
      action(),
      [frame('frame:1', 100), frame('frame:2', 200), frame('frame:3', 300)],
    )

    expect(schedule.frames.map((item) => item.durationMs)).toEqual([100, 200, 300])
    expect(schedule.frames.map((item) => item.startTimeMs)).toEqual([0, 100, 300])
    expect(schedule.totalDurationMs).toBe(600)
  })

  it('makes a peak in the speed curve shorten the corresponding frame while preserving total duration', () => {
    const curve: SpeedCurve = {
      version: 1,
      preserveTotalDuration: true,
      keyframes: [
        {
          id: 'key:start',
          time: 0,
          value: 1,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'linear',
        },
        {
          id: 'key:peak',
          time: 0.5,
          value: 2,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'linear',
        },
        {
          id: 'key:end',
          time: 1,
          value: 1,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'linear',
        },
      ],
    }
    const schedule = computeFrameSchedule(
      action({ timing: { speedCurve: curve } }),
      [frame('frame:1'), frame('frame:2'), frame('frame:3')],
    )

    expect(schedule.totalDurationMs).toBe(375)
    expect(schedule.frames[1].durationMs).toBeLessThan(schedule.frames[0].durationMs)
    expect(schedule.frames[0].durationMs).toBeCloseTo(schedule.frames[2].durationMs, 10)
  })

  it('allows the curve to change total duration when preservation is disabled', () => {
    const curve: SpeedCurve = {
      ...createDefaultSpeedCurve(),
      preserveTotalDuration: false,
      keyframes: [
        {
          id: 'key:start',
          time: 0,
          value: 2,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'linear',
        },
        {
          id: 'key:end',
          time: 1,
          value: 2,
          inTangent: 0,
          outTangent: 0,
          interpolation: 'linear',
        },
      ],
    }
    const schedule = computeFrameSchedule(
      action({ timing: { speedCurve: curve } }),
      [frame('frame:1'), frame('frame:2'), frame('frame:3')],
    )

    expect(schedule.frames.map((item) => item.durationMs)).toEqual([62.5, 62.5, 62.5])
    expect(schedule.totalDurationMs).toBe(187.5)
  })
})