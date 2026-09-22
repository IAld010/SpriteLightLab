import { create } from 'zustand'
import {
  CAMERA_SHAKE_PRESETS,
  createCameraShakeEvent,
  normalizeCameraShakeEvent,
} from '../domain/frameEvents'
import type { ActionFrameEvent, CameraShakePayload, CameraShakePreset } from '../domain/types'

interface FrameEventState {
  events: ActionFrameEvent[]
  selectedEventId?: string
  dirty: boolean
  revision: number
  initialize: (events: ActionFrameEvent[]) => void
  reset: () => void
  addEvent: (actionId: string, frameId: string) => string
  selectEvent: (eventId?: string) => void
  updateEvent: (eventId: string, patch: Partial<Pick<ActionFrameEvent, 'enabled'>>) => void
  updatePayload: (eventId: string, patch: Partial<CameraShakePayload>) => void
  applyPreset: (eventId: string, preset: CameraShakePreset) => void
  duplicateEvent: (eventId: string) => string | undefined
  removeEvent: (eventId: string) => void
  markClean: () => void
}

export const useFrameEventStore = create<FrameEventState>((set, get) => ({
  events: [],
  dirty: false,
  revision: 0,

  initialize: (events) => set({
    events: (events ?? []).map(normalizeCameraShakeEvent),
    selectedEventId: events?.[0]?.id,
    dirty: false,
    revision: 0,
  }),

  reset: () => set({
    events: [],
    selectedEventId: undefined,
    dirty: false,
    revision: 0,
  }),

  addEvent: (actionId, frameId) => {
    const event = createCameraShakeEvent(actionId, frameId)
    set((state) => ({
      events: [...state.events, event],
      selectedEventId: event.id,
      dirty: true,
      revision: state.revision + 1,
    }))
    return event.id
  },

  selectEvent: (selectedEventId) => set({ selectedEventId }),

  updateEvent: (eventId, patch) => set((state) => ({
    events: state.events.map((event) => event.id === eventId ? { ...event, ...patch } : event),
    dirty: true,
    revision: state.revision + 1,
  })),

  updatePayload: (eventId, patch) => set((state) => ({
    events: state.events.map((event) => event.id === eventId
      ? normalizeCameraShakeEvent({
          ...event,
          payload: { ...event.payload, ...patch, preset: patch.preset ?? 'custom' },
        })
      : event),
    dirty: true,
    revision: state.revision + 1,
  })),

  applyPreset: (eventId, preset) => {
    const payload = preset === 'custom'
      ? { ...(get().events.find((event) => event.id === eventId)?.payload ?? CAMERA_SHAKE_PRESETS.light), preset: 'custom' as const }
      : { ...CAMERA_SHAKE_PRESETS[preset], preset }
    set((state) => ({
      events: state.events.map((event) => event.id === eventId
        ? normalizeCameraShakeEvent({ ...event, payload })
        : event),
      dirty: true,
      revision: state.revision + 1,
    }))
  },

  duplicateEvent: (eventId) => {
    const event = get().events.find((candidate) => candidate.id === eventId)
    if (!event) return undefined
    const duplicate = normalizeCameraShakeEvent({
      ...event,
      id: `frame-event:${crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`}`,
      payload: { ...event.payload, seed: event.payload.seed + 1 },
    })
    set((state) => ({
      events: [...state.events, duplicate],
      selectedEventId: duplicate.id,
      dirty: true,
      revision: state.revision + 1,
    }))
    return duplicate.id
  },

  removeEvent: (eventId) => set((state) => ({
    events: state.events.filter((event) => event.id !== eventId),
    selectedEventId: state.selectedEventId === eventId ? undefined : state.selectedEventId,
    dirty: true,
    revision: state.revision + 1,
  })),

  markClean: () => set({ dirty: false }),
}))

export function eventsForFrame(
  events: readonly ActionFrameEvent[],
  actionId: string,
  frameId: string,
): ActionFrameEvent[] {
  return events.filter((event) => event.actionId === actionId && event.frameId === frameId)
}

export function getFrameEventProjectState(): ActionFrameEvent[] {
  return useFrameEventStore.getState().events
}
