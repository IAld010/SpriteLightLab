export interface SheetFrameInput {
  key: string
  width: number
  height: number
}

export interface SheetPlacement {
  key: string
  x: number
  y: number
  width: number
  height: number
}

export interface SheetLayout {
  width: number
  height: number
  placements: SheetPlacement[]
}

export interface SheetPackingOptions {
  /** Transparent gutter between neighbouring frames. */
  padding?: number
  /** Sheet wraps to a new row once the next frame would exceed this width. */
  maxWidth?: number
}

function safeSize(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
}

/**
 * Deterministic shelf packing: frames keep their input order, rows are as tall as
 * their tallest frame. Good enough for sprite sheets and stable across runs.
 */
export function packSheet(frames: SheetFrameInput[], options: SheetPackingOptions = {}): SheetLayout {
  const padding = Math.max(0, Math.round(options.padding ?? 0))
  const maxWidth = safeSize(options.maxWidth ?? 2048)
  const placements: SheetPlacement[] = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  let sheetWidth = 0

  for (const frame of frames) {
    const width = safeSize(frame.width)
    const height = safeSize(frame.height)
    let x = cursorX === 0 ? 0 : cursorX + padding
    if (cursorX > 0 && x + width > maxWidth) {
      cursorY += rowHeight + padding
      x = 0
      rowHeight = 0
    }
    placements.push({ key: frame.key, x, y: cursorY, width, height })
    cursorX = x + width
    rowHeight = Math.max(rowHeight, height)
    sheetWidth = Math.max(sheetWidth, cursorX)
  }

  return {
    width: Math.max(1, sheetWidth),
    height: Math.max(1, cursorY + rowHeight),
    placements,
  }
}

export function placementMap(layout: SheetLayout): Map<string, SheetPlacement> {
  return new Map(layout.placements.map((placement) => [placement.key, placement]))
}
