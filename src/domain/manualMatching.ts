import type { AssetBundle, ImportWarning, PreviewFrame } from './types'

export interface MatchingRow {
  id: string
  sourceFrameId?: string
  normalCandidateId?: string
}

export interface MatchingWorkspace {
  rows: MatchingRow[]
  unpairedSourceIds: string[]
  unpairedNormalIds: string[]
}

const PAIRING_WARNING_CODES = new Set([
  'missing-normal',
  'normal-pairing-blocked',
  'missing-normal-atlas',
  'frame-size-mismatch',
  'normal-pairing-size-mismatch',
  'duplicate-normal',
  'unpaired-normal',
  'assumed-normal-layout',
])

export function createMatchingWorkspace(bundle: AssetBundle): MatchingWorkspace {
  const rows: MatchingRow[] = []
  const unpairedSourceIds: string[] = []
  const usedNormalIds = new Set<string>()

  for (const frame of bundle.frames) {
    if (frame.normal && (frame.pairingStatus === 'matched' || frame.pairingStatus === 'manual')) {
      rows.push({
        id: `matching-row:${frame.id}`,
        sourceFrameId: frame.id,
        normalCandidateId: frame.normal.id,
      })
      usedNormalIds.add(frame.normal.id)
    } else {
      unpairedSourceIds.push(frame.id)
    }
  }

  return {
    rows,
    unpairedSourceIds,
    unpairedNormalIds: bundle.normalCandidates
      .filter((candidate) => !usedNormalIds.has(candidate.id))
      .map((candidate) => candidate.id),
  }
}

export function applyManualMatching(
  bundle: AssetBundle,
  rows: MatchingRow[],
): AssetBundle {
  const sourceById = new Map(bundle.frames.map((frame) => [frame.id, frame]))
  const candidateById = new Map(
    bundle.normalCandidates.map((candidate) => [candidate.id, candidate]),
  )
  const imageById = new Map(bundle.images.map((image) => [image.id, image]))
  const usedNormals = new Set<string>()
  const warnings: ImportWarning[] = bundle.warnings.filter(
    (warning) => !PAIRING_WARNING_CODES.has(warning.code),
  )
  const frames: PreviewFrame[] = []

  for (const row of rows) {
    const sourceFrame = row.sourceFrameId ? sourceById.get(row.sourceFrameId) : undefined
    if (!sourceFrame) {
      continue
    }

    const candidate = row.normalCandidateId
      ? candidateById.get(row.normalCandidateId)
      : undefined
    const colorImage = imageById.get(sourceFrame.source.imageId)
    const normalImage = candidate ? imageById.get(candidate.imageId) : undefined
    const duplicate = candidate ? usedNormals.has(candidate.id) : false
    const sizeMismatch =
      candidate &&
      colorImage &&
      normalImage &&
      (colorImage.width !== normalImage.width || colorImage.height !== normalImage.height)

    if (candidate && !duplicate && !sizeMismatch) {
      usedNormals.add(candidate.id)
    }

    if (candidate && sizeMismatch && colorImage && normalImage) {
      warnings.push({
        code: 'normal-pairing-size-mismatch',
        severity: 'error',
        frameId: sourceFrame.id,
        message: `法线图尺寸必须与精灵图完全一致：精灵图 ${colorImage.width}×${colorImage.height}，法线图 ${normalImage.width}×${normalImage.height}。`,
      })
    }

    frames.push({
      ...sourceFrame,
      normal: candidate && !duplicate && !sizeMismatch ? candidate : undefined,
      pairingStatus:
        candidate && !duplicate
          ? sizeMismatch
            ? 'mismatch'
            : 'manual'
          : 'missing',
    })
  }

  const includedFrameIds = new Set(frames.map((frame) => frame.id))
  const animations = bundle.animations
    .map((animation) => ({
      ...animation,
      frameIds: animation.frameIds.filter((frameId) => includedFrameIds.has(frameId)),
    }))
    .filter((animation) => animation.frameIds.length > 0)

  return {
    ...bundle,
    frames,
    animations:
      animations.length > 0
        ? animations
        : frames.length > 0
          ? [
              {
                id: 'clip:manual-default',
                name: 'default',
                frameIds: frames.map((frame) => frame.id),
                fps: 8,
                loop: true,
              },
            ]
          : [],
    warnings,
  }
}