export type ObjectRect = [x: number, y: number, width: number, height: number]

export function objectRectFromSpriteAnchor(
  positionX: number,
  positionY: number,
  spriteWidth: number,
  spriteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  anchorX = 0.5,
  anchorY = 0.5,
): ObjectRect {
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
  return [
    (positionX - spriteWidth * anchorX) / safeViewportWidth,
    (positionY - spriteHeight * anchorY) / safeViewportHeight,
    spriteWidth / safeViewportWidth,
    spriteHeight / safeViewportHeight,
  ]
}

export function lightPointToObject(
  viewportX: number,
  viewportY: number,
  objectRect: ObjectRect,
): [number, number] {
  return [
    objectRect[2] > 0 ? (viewportX - objectRect[0]) / objectRect[2] : 0,
    objectRect[3] > 0 ? (viewportY - objectRect[1]) / objectRect[3] : 0,
  ]
}