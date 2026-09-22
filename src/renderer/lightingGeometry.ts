export type ObjectRect = [x: number, y: number, width: number, height: number]

export function objectRectFromSpriteAnchor(
  anchorX: number,
  anchorY: number,
  spriteWidth: number,
  spriteHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ObjectRect {
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
  return [
    (anchorX - spriteWidth / 2) / safeViewportWidth,
    (anchorY - spriteHeight / 2) / safeViewportHeight,
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