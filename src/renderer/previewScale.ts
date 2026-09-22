export function computeAlignedSpriteScale(
  actionScale: number,
  outputScale: number,
): number {
  const safeOutputScale = Math.max(Number.EPSILON, outputScale)
  return actionScale / safeOutputScale
}