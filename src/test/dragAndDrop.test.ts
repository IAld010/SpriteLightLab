import { describe, expect, it, vi } from 'vitest'
import {
  INTERNAL_DRAG_TYPE,
  MATCH_DRAG_TYPE,
  isExternalFileDrag,
  isInternalDrag,
  markInternalDrag,
} from '../utils/dragAndDrop'

function dragEvent(types: string[]) {
  const setData = vi.fn()
  return {
    event: {
      dataTransfer: {
        types,
        setData,
        effectAllowed: 'none',
      },
    } as unknown as DragEvent,
    setData,
  }
}

describe('drag and drop classification', () => {
  it('accepts file drags but rejects text selections and internal drags', () => {
    expect(isExternalFileDrag(dragEvent(['Files']).event)).toBe(true)
    expect(isExternalFileDrag(dragEvent(['text/plain']).event)).toBe(false)
    expect(isExternalFileDrag(dragEvent(['Files', INTERNAL_DRAG_TYPE]).event)).toBe(false)
    expect(isExternalFileDrag(dragEvent(['Files', MATCH_DRAG_TYPE]).event)).toBe(false)
  })

  it('marks internal drags with a dedicated MIME type', () => {
    const { event, setData } = dragEvent([])

    markInternalDrag(event)

    expect(setData).toHaveBeenCalledWith(INTERNAL_DRAG_TYPE, '1')
    expect(event.dataTransfer?.effectAllowed).toBe('move')
  })

  it('recognizes both frame and matching internal drag types', () => {
    expect(isInternalDrag(dragEvent([INTERNAL_DRAG_TYPE]).event)).toBe(true)
    expect(isInternalDrag(dragEvent([MATCH_DRAG_TYPE]).event)).toBe(true)
  })
})