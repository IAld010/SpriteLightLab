import type { ActionAlignment, FrameAlignment } from '../domain/types'
import { objectRectFromSpriteAnchor, type ObjectRect } from './lightingGeometry'
import { computeAlignedSpriteScale } from './previewScale'

export interface PreviewLayoutInput {
  viewportWidth: number
  viewportHeight: number
  textureWidth: number
  textureHeight: number
  frameWidth: number
  frameHeight: number
  frameAlignment?: FrameAlignment
  actionAlignment?: ActionAlignment
  zoom: number
  panX: number
  panY: number
}

export interface PreviewLayout {
  viewportWidth: number
  viewportHeight: number
  displayScale: number
  displayX: number
  displayY: number
  anchorX: number
  anchorY: number
  objectRect: ObjectRect
}

export function computePreviewLayout(input: PreviewLayoutInput): PreviewLayout {
  const viewportWidth = Math.max(input.viewportWidth, 1)
  const viewportHeight = Math.max(input.viewportHeight, 1)
  const textureWidth = Math.max(input.textureWidth, 1)
  const textureHeight = Math.max(input.textureHeight, 1)
  const frameWidth = Math.max(input.frameWidth, 1)
  const frameHeight = Math.max(input.frameHeight, 1)
  let displayScale: number
  let displayX: number
  let displayY: number
  let anchorX: number
  let anchorY: number

  if (input.actionAlignment && input.frameAlignment) {
    const outputScale = textureWidth / frameWidth
    const canvasWidth = Math.max(input.actionAlignment.canvasWidth, 1)
    const canvasHeight = Math.max(input.actionAlignment.canvasHeight, 1)
    const fit = Math.min(
      (viewportWidth * 0.68) / canvasWidth,
      (viewportHeight * 0.68) / canvasHeight,
    )
    const actionScale = Math.max(0.05, fit * input.actionAlignment.scale * input.zoom)
    const canvasLeft =
      viewportWidth / 2 - (canvasWidth * actionScale) / 2 + (input.panX * viewportWidth) / 2
    const canvasTop =
      viewportHeight / 2 - (canvasHeight * actionScale) / 2 + (input.panY * viewportHeight) / 2
    displayScale = computeAlignedSpriteScale(actionScale, outputScale)
    displayX = canvasLeft + (input.actionAlignment.anchorX + input.frameAlignment.offsetX) * actionScale
    displayY = canvasTop + (input.actionAlignment.anchorY + input.frameAlignment.offsetY) * actionScale
    anchorX = input.frameAlignment.pivotX / frameWidth
    anchorY = input.frameAlignment.pivotY / frameHeight
  } else {
    const fit = Math.min(
      (viewportWidth * 0.68) / textureWidth,
      (viewportHeight * 0.68) / textureHeight,
    )
    displayScale = Math.max(0.05, fit * input.zoom)
    displayX = viewportWidth / 2 + (input.panX * viewportWidth) / 2
    displayY = viewportHeight / 2 + (input.panY * viewportHeight) / 2
    anchorX = 0.5
    anchorY = 0.5
  }

  return {
    viewportWidth,
    viewportHeight,
    displayScale,
    displayX,
    displayY,
    anchorX,
    anchorY,
    objectRect: objectRectFromSpriteAnchor(
      displayX,
      displayY,
      textureWidth * displayScale,
      textureHeight * displayScale,
      viewportWidth,
      viewportHeight,
      anchorX,
      anchorY,
    ),
  }
}