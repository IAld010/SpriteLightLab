import type { ActionAlignment, AnchorPreset, FrameAlignment } from './types'

export interface AlignmentFrame {
  id: string
  width: number
  height: number
  alignment: FrameAlignment
}

export interface FrameCanvasPlacement {
  x: number
  y: number
  width: number
  height: number
}

export function resolveFrameAlignment(
  width: number,
  height: number,
  preset: AnchorPreset = 'bottom-center',
): FrameAlignment {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  if (preset === 'center') {
    return {
      pivotX: safeWidth / 2,
      pivotY: safeHeight / 2,
      offsetX: 0,
      offsetY: 0,
    }
  }
  return {
    pivotX: safeWidth / 2,
    pivotY: safeHeight,
    offsetX: 0,
    offsetY: 0,
  }
}

export function computeActionAlignment(frames: AlignmentFrame[]): ActionAlignment {
  if (frames.length === 0) {
    return { canvasWidth: 1, canvasHeight: 1, anchorX: 0, anchorY: 0, scale: 1 }
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const frame of frames) {
    const left = -frame.alignment.pivotX + frame.alignment.offsetX
    const top = -frame.alignment.pivotY + frame.alignment.offsetY
    minX = Math.min(minX, left)
    minY = Math.min(minY, top)
    maxX = Math.max(maxX, left + frame.width)
    maxY = Math.max(maxY, top + frame.height)
  }
  const canvasMinX = Math.min(0, minX)
  const canvasMinY = Math.min(0, minY)
  const canvasMaxX = Math.max(0, maxX)
  const canvasMaxY = Math.max(0, maxY)
  return {
    canvasWidth: Math.max(1, Math.ceil(canvasMaxX - canvasMinX)),
    canvasHeight: Math.max(1, Math.ceil(canvasMaxY - canvasMinY)),
    anchorX: -canvasMinX,
    anchorY: -canvasMinY,
    scale: 1,
  }
}

export function frameCanvasPlacement(
  frame: Pick<AlignmentFrame, 'width' | 'height' | 'alignment'>,
  layout: Pick<ActionAlignment, 'anchorX' | 'anchorY'>,
): FrameCanvasPlacement {
  return {
    x: layout.anchorX - frame.alignment.pivotX + frame.alignment.offsetX,
    y: layout.anchorY - frame.alignment.pivotY + frame.alignment.offsetY,
    width: frame.width,
    height: frame.height,
  }
}
