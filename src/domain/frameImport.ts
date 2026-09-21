import type { AnimationClip, ImportWarning, PreviewFrame, RuntimeImage, TextureRef } from './types'
import { baseFileName, naturalCompare, normalizePath, slugify, stripExtension, uniqueId } from './pathUtils'

const NORMAL_TOKEN = /[_\-.](?:normal|n)(?=(?:[_\-.](?:\d{1,6}))?$)/i
const COLOR_TOKEN = /[_\-.](?:diffuse|albedo|color|col)(?=(?:[_\-.](?:\d{1,6}))?$)/i

export function isNormalFileName(name: string): boolean {
  return NORMAL_TOKEN.test(stripExtension(baseFileName(name)))
}

export function normalBaseName(name: string): string {
  return canonicalAssetBaseName(name)
}

export function colorBaseName(name: string): string {
  return canonicalAssetBaseName(name)
}

function canonicalAssetBaseName(name: string): string {
  const stem = stripExtension(normalizePath(name))
  return stem.replace(COLOR_TOKEN, '').replace(NORMAL_TOKEN, '')
}

export function inferActionName(path: string): string {
  const normalized = normalizePath(path)
  const parts = normalized.split('/')
  const stem = stripExtension(parts.at(-1) ?? normalized)
  const actionStem = stem.replace(COLOR_TOKEN, '').replace(NORMAL_TOKEN, '')
  const parent = parts.length > 1 ? parts.at(-2) ?? '' : ''
  const numbered = actionStem.match(/^(.*?)(?:[_\-\s]?)(\d{1,6})$/)

  if (numbered?.[1]) {
    return numbered[1]
  }

  if (/^\d{1,6}$/.test(actionStem) && parent && parent !== '.') {
    return parent
  }

  if (/^\d{1,6}$/.test(actionStem)) {
    return 'default'
  }

  return actionStem || 'default'
}

export function textureRefForImage(image: RuntimeImage): TextureRef {
  return {
    id: uniqueId('image', image.id),
    name: image.name,
    imageId: image.id,
    path: image.path,
  }
}

export function pairFrameImages(
  colorImages: RuntimeImage[],
  normalImages: RuntimeImage[],
): {
  frames: PreviewFrame[]
  normalCandidates: TextureRef[]
  warnings: ImportWarning[]
} {
  const warnings: ImportWarning[] = []
  const normalByBase = new Map<string, RuntimeImage[]>()
  const usedNormals = new Set<string>()

  for (const normal of normalImages) {
    const key = normalBaseName(normal.path)
    const bucket = normalByBase.get(key) ?? []
    bucket.push(normal)
    normalByBase.set(key, bucket)
  }

  const orderedColors = [...colorImages].sort((left, right) => naturalCompare(left.path, right.path))
  const frames = orderedColors.map((image) => {
    const key = colorBaseName(image.path)
    const candidates = normalByBase.get(key) ?? []
    const normal = candidates.find((candidate) => !usedNormals.has(candidate.id))
    const sizeMismatch =
      normal && (normal.width !== image.width || normal.height !== image.height)

    if (normal && !sizeMismatch) {
      usedNormals.add(normal.id)
    }

    if (sizeMismatch && normal) {
      warnings.push({
        code: 'frame-size-mismatch',
        severity: 'error',
        path: image.path,
        message: `${image.name} 与 ${normal.name} 的像素尺寸不一致：精灵图 ${image.width}×${image.height}，法线图 ${normal.width}×${normal.height}。颜色图与法线图必须尺寸完全相同。`,
      })
    }

    if (candidates.length > 1) {
      warnings.push({
        code: 'duplicate-normal',
        severity: 'warning',
        path: image.path,
        message: `${image.name} 匹配到多张同名法线图，已选择第一张，可在配对面板中校正。`,
      })
    }

    const frameId = uniqueId('frame', image.id)
    if (!normal || sizeMismatch) {
      warnings.push({
        code: 'missing-normal',
        severity: 'warning',
        frameId,
        path: image.path,
        message: `${image.name} 未找到法线图；预览将使用平坦法线。`,
      })
    }

    return {
      id: frameId,
      name: stripExtension(baseFileName(image.name)),
      source: textureRefForImage(image),
      normal: normal && !sizeMismatch ? textureRefForImage(normal) : undefined,
      pairingStatus: normal && !sizeMismatch ? 'matched' : sizeMismatch ? 'mismatch' : 'missing',
    } satisfies PreviewFrame
  })

  const unpairedNormals = normalImages.filter((image) => !usedNormals.has(image.id))
  if (unpairedNormals.length > 0) {
    warnings.push({
      code: 'unpaired-normal',
      severity: 'warning',
      message: `有 ${unpairedNormals.length} 张法线图未自动配对，可在配对面板中手动指定。`,
    })
  }

  return {
    frames,
    normalCandidates: normalImages
      .slice()
      .sort((left, right) => naturalCompare(left.path, right.path))
      .map(textureRefForImage),
    warnings,
  }
}

export function groupFramesIntoAnimations(frames: PreviewFrame[], fps = 8): AnimationClip[] {
  const groups = new Map<string, PreviewFrame[]>()

  for (const frame of frames) {
    const action = inferActionName(frame.source.path ?? frame.source.name)
    const bucket = groups.get(action) ?? []
    bucket.push(frame)
    groups.set(action, bucket)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => naturalCompare(left, right))
    .map(([name, group], index) => {
      const sorted = group.sort((left, right) =>
        naturalCompare(left.source.name, right.source.name),
      )
      return {
        id: `clip:${slugify(name)}:${index}`,
        name,
        frameIds: sorted.map((frame) => frame.id),
        fps,
        loop: true,
      }
    })
}

export function findFrameById(frames: PreviewFrame[], frameId: string): PreviewFrame | undefined {
  return frames.find((frame) => frame.id === frameId)
}