import type { ActionFrameEvent, CameraShakePayload, CameraShakePreset } from './types'

export const CAMERA_SHAKE_PRESETS: Record<Exclude<CameraShakePreset, 'custom'>, CameraShakePayload> = {
  light: {
    preset: 'light',
    strength: 0.24,
    durationMs: 220,
    frequency: 28,
    decay: 0.08,
    xWeight: 1,
    yWeight: 0.7,
    rotationWeight: 0,
    scaleWeight: 0,
    seed: 101,
  },
  heavy: {
    preset: 'heavy',
    strength: 0.58,
    durationMs: 420,
    frequency: 24,
    decay: 0.055,
    xWeight: 1,
    yWeight: 0.9,
    rotationWeight: 0.15,
    scaleWeight: 0.05,
    seed: 202,
  },
  explosion: {
    preset: 'explosion',
    strength: 0.82,
    durationMs: 720,
    frequency: 34,
    decay: 0.035,
    xWeight: 1,
    yWeight: 1,
    rotationWeight: 0.35,
    scaleWeight: 0.14,
    seed: 303,
  },
  landing: {
    preset: 'landing',
    strength: 0.46,
    durationMs: 300,
    frequency: 20,
    decay: 0.07,
    xWeight: 0.35,
    yWeight: 1,
    rotationWeight: 0.05,
    scaleWeight: 0.16,
    seed: 404,
  },
}

function makeId(): string {
  return `frame-event:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`
}

export function createCameraShakeEvent(actionId: string, frameId: string): ActionFrameEvent {
  return {
    id: makeId(),
    actionId,
    frameId,
    type: 'camera-shake',
    enabled: true,
    payload: { ...CAMERA_SHAKE_PRESETS.light },
  }
}

export function normalizeCameraShakeEvent(event: ActionFrameEvent): ActionFrameEvent {
  return {
    ...event,
    type: 'camera-shake',
    enabled: event.enabled !== false,
    payload: {
      ...CAMERA_SHAKE_PRESETS.light,
      ...event.payload,
      preset: event.payload?.preset ?? 'custom',
      strength: clamp(event.payload?.strength ?? 0.24, 0, 1),
      durationMs: clamp(event.payload?.durationMs ?? 220, 20, 5000),
      frequency: clamp(event.payload?.frequency ?? 28, 1, 120),
      decay: clamp(event.payload?.decay ?? 0.08, 0.001, 1),
      xWeight: clamp(event.payload?.xWeight ?? 1, 0, 3),
      yWeight: clamp(event.payload?.yWeight ?? 0.7, 0, 3),
      rotationWeight: clamp(event.payload?.rotationWeight ?? 0, 0, 3),
      scaleWeight: clamp(event.payload?.scaleWeight ?? 0, 0, 3),
      seed: Math.round(event.payload?.seed ?? 101),
    },
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
