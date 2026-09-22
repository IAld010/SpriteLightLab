import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useObjectUrl } from '../hooks/useObjectUrl'

let nextUrl = 0
let createSpy: ReturnType<typeof vi.spyOn>
let revokeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  nextUrl = 0
  createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++nextUrl}`)
  revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  createSpy.mockRestore()
  revokeSpy.mockRestore()
})

describe('useObjectUrl', () => {
  it('survives StrictMode remounting without invalidating or duplicating the URL', async () => {
    const file = new File(['pixel'], 'strict.png', { type: 'image/png' })
    const { result, unmount } = renderHook(() => useObjectUrl(file), {
      wrapper: StrictMode,
    })

    await waitFor(() => expect(result.current).toBe('blob:test-1'))
    expect(createSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      unmount()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-1')
  })

  it('revokes the previous file URL when the selected file changes', async () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.png', { type: 'image/png' })
    const { result, rerender, unmount } = renderHook(
      ({ file }) => useObjectUrl(file),
      { initialProps: { file: first } },
    )

    await waitFor(() => expect(result.current).toBe('blob:test-1'))
    rerender({ file: second })
    await waitFor(() => expect(result.current).toBe('blob:test-2'))
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith('blob:test-1'))

    unmount()
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith('blob:test-2'))
  })
})