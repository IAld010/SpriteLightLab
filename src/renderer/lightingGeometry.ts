export type ObjectRect = [x: number, y: number, width: number, height: number]

export function objectRectFromCenter(
  centerX: number,
  centerY: number,
  objectWidth: number,
  objectHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ObjectRect {
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
  return [
    (centerX - objectWidth / 2) / safeViewportWidth,
    (centerY - objectHeight / 2) / safeViewportHeight,
    objectWidth / safeViewportWidth,
    objectHeight / safeViewportHeight,
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