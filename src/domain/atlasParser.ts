import type { AtlasAnimationData, AtlasData, AtlasFrameData, Rect } from './types'

type JsonRecord = Record<string, unknown>

export class AtlasParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AtlasParseError'
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseRect(value: unknown): Rect | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const x = asNumber(value.x)
  const y = asNumber(value.y)
  const width = asNumber(value.w ?? value.width)
  const height = asNumber(value.h ?? value.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }
  return { x, y, width, height }
}

function normalizeFrames(framesValue: unknown): AtlasFrameData[] {
  if (Array.isArray(framesValue)) {
    return framesValue.flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return []
      }
      const rect = parseRect(entry.frame)
      const name = asString(entry.filename) ?? `frame_${index}`
      if (!rect) {
        return []
      }
      return [
        {
          name,
          rect,
          durationMs: asNumber(entry.duration),
          rotated: entry.rotated === true,
        },
      ]
    })
  }

  if (isRecord(framesValue)) {
    return Object.entries(framesValue).flatMap(([key, entry]) => {
      if (!isRecord(entry)) {
        return []
      }
      const rect = parseRect(entry.frame)
      if (!rect) {
        return []
      }
      return [
        {
          name: asString(entry.filename) ?? key,
          rect,
          durationMs: asNumber(entry.duration),
          rotated: entry.rotated === true,
        },
      ]
    })
  }

  return []
}

function normalizeAnimations(value: unknown): AtlasAnimationData[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return []
      }
      const name = asString(entry.name) ?? `animation_${index}`
      const frames = Array.isArray(entry.frames)
        ? entry.frames.flatMap((frame) => {
            if (typeof frame === 'string') {
              return [frame]
            }
            if (isRecord(frame)) {
              const filename = asString(frame.filename) ?? asString(frame.name)
              return filename ? [filename] : []
            }
            return []
          })
        : []
      return frames.length > 0 ? [{ name, frameNames: frames }] : []
    })
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([name, entry]) => {
      if (!isRecord(entry) || !Array.isArray(entry.frames)) {
        return []
      }
      const frameNames = entry.frames.filter((frame): frame is string => typeof frame === 'string')
      return frameNames.length > 0 ? [{ name, frameNames }] : []
    })
  }

  return []
}

function normalizeAsepriteTags(
  frames: AtlasFrameData[],
  tagsValue: unknown,
): AtlasAnimationData[] {
  if (!Array.isArray(tagsValue)) {
    return []
  }

  return tagsValue.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return []
    }
    const from = asNumber(entry.from)
    const to = asNumber(entry.to)
    if (from === undefined || to === undefined) {
      return []
    }
    const start = Math.max(0, Math.min(from, to))
    const end = Math.min(frames.length - 1, Math.max(from, to))
    const frameNames = frames.slice(start, end + 1).map((frame) => frame.name)
    return [
      {
        name: asString(entry.name) ?? `tag_${index}`,
        frameNames,
      },
    ]
  })
}

export function parseAtlasJson(rawText: string, sourceName: string): AtlasData {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new AtlasParseError(`${sourceName} 不是有效的 JSON 文件。`)
  }

  if (!isRecord(parsed)) {
    throw new AtlasParseError(`${sourceName} 的顶层结构必须是对象。`)
  }

  const frames = normalizeFrames(parsed.frames)
  if (frames.length === 0) {
    throw new AtlasParseError(`${sourceName} 未找到有效的 frames 数据。`)
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : undefined
  const metaAnimation = normalizeAnimations(parsed.animations)
  const tags = normalizeAsepriteTags(frames, meta?.frameTags)
  const animations = metaAnimation.length > 0 ? metaAnimation : tags
  const sizeRecord = meta && isRecord(meta.size) ? meta.size : undefined
  const width = sizeRecord ? asNumber(sizeRecord.w ?? sizeRecord.width) : undefined
  const height = sizeRecord ? asNumber(sizeRecord.h ?? sizeRecord.height) : undefined

  return {
    schema: meta?.frameTags ? 'aseprite' : 'texturepacker',
    imageName: meta ? asString(meta.image) : undefined,
    size: width !== undefined && height !== undefined ? { width, height } : undefined,
    frames,
    animations,
  }
}

export function validateAtlasLayout(color: AtlasData, normal: AtlasData): string[] {
  const issues: string[] = []
  if (color.frames.length !== normal.frames.length) {
    issues.push(`颜色图集有 ${color.frames.length} 帧，法线图集有 ${normal.frames.length} 帧。`)
  }

  const count = Math.min(color.frames.length, normal.frames.length)
  for (let index = 0; index < count; index += 1) {
    const left = color.frames[index]
    const right = normal.frames[index]
    const sameRect =
      left.rect.x === right.rect.x &&
      left.rect.y === right.rect.y &&
      left.rect.width === right.rect.width &&
      left.rect.height === right.rect.height
    if (!sameRect) {
      issues.push(`第 ${index + 1} 帧的裁剪区域不一致，无法安全共用 UV。`)
    }
  }

  if (color.size && normal.size && (color.size.width !== normal.size.width || color.size.height !== normal.size.height)) {
    issues.push(`图集尺寸不一致：${color.size.width}×${color.size.height} 与 ${normal.size.width}×${normal.size.height}。`)
  }

  return issues
}

export function atlasContainsRotatedFrames(atlas: AtlasData): boolean {
  return atlas.frames.some((frame) => frame.rotated)
}