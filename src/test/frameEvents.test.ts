import { beforeEach, describe, expect, it } from 'vitest'
import { CAMERA_SHAKE_PRESETS, createCameraShakeEvent, normalizeCameraShakeEvent } from '../domain/frameEvents'
import { CameraShake } from '../renderer/CameraShake'
import { eventsForFrame, useFrameEventStore } from '../store/frameEventStore'

describe('frame events', () => {
  beforeEach(() => {
    useFrameEventStore.getState().reset()
  })

  it('creates, edits, duplicates and removes camera shake events', () => {
    const eventId = useFrameEventStore.getState().addEvent('action:1', 'frame:1')
    let event = useFrameEventStore.getState().events[0]
    expect(event.id).toBe(eventId)
    expect(event.type).toBe('camera-shake')

    useFrameEventStore.getState().updatePayload(eventId, { strength: 0.9 })
    event = useFrameEventStore.getState().events[0]
    expect(event.payload.strength).toBe(0.9)
    expect(event.payload.preset).toBe('custom')

    useFrameEventStore.getState().applyPreset(eventId, 'explosion')
    event = useFrameEventStore.getState().events[0]
    expect(event.payload.preset).toBe('explosion')
    expect(event.payload.durationMs).toBe(CAMERA_SHAKE_PRESETS.explosion.durationMs)

    const duplicateId = useFrameEventStore.getState().duplicateEvent(eventId)
    expect(duplicateId).toBeTruthy()
    expect(useFrameEventStore.getState().events).toHaveLength(2)
    useFrameEventStore.getState().removeEvent(eventId)
    expect(useFrameEventStore.getState().events).toHaveLength(1)
  })

  it('filters events by action and frame', () => {
    const first = createCameraShakeEvent('action:1', 'frame:1')
    const second = createCameraShakeEvent('action:1', 'frame:2')
    expect(eventsForFrame([first, second], 'action:1', 'frame:1')).toEqual([first])
  })

  it('normalizes invalid payload values', () => {
    const event = createCameraShakeEvent('action:1', 'frame:1')
    event.payload.strength = 3
    event.payload.durationMs = 5
    const normalized = normalizeCameraShakeEvent(event)
    expect(normalized.payload.strength).toBe(1)
    expect(normalized.payload.durationMs).toBe(20)
  })
})

describe('camera shake trauma model', () => {
  it('produces deterministic movement and decays', () => {
    const firstShake = new CameraShake()
    const secondShake = new CameraShake()
    const payload = { ...CAMERA_SHAKE_PRESETS.heavy, seed: 42 }
    firstShake.trigger(payload)
    secondShake.trigger(payload)
    const first = firstShake.update(16)
    const deterministic = secondShake.update(16)
    const later = firstShake.update(16)
    expect(first).toBeDefined()
    expect(deterministic).toEqual(first)
    expect(later).not.toEqual(first)
    firstShake.reset()
    expect(firstShake.update(16)).toBeUndefined()
  })
})
