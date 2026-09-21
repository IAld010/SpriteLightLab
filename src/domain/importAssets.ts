import { AtlasParseError, atlasContainsRotatedFrames, parseAtlasJson, validateAtlasLayout } from './atlasParser'
import { groupFramesIntoAnimations, isNormalFileName, pairFrameImages } from './frameImport'
import { analyzeBundlePalette } from './paletteAnalysis'
import { baseFileName, fileExtension, normalizePath, slugify, stripExtension, uniqueId } from './pathUtils'
import type {
  AnimationClip,
  AssetBundle,
  AtlasData,
  ImportWarning,
  PreviewFrame,
  RuntimeImage,
  TextureRef,
} from './types'

interface ParsedAtlasSource {
  fileName: string
  data: AtlasData
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

function pathForFile(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return normalizePath(relative && relative.length > 0 ? relative : file.name)
}

function imageIdForFile(file: File, path: string): string {
  return `${path}:${file.size}:${file.lastModified}`
}

async function dimensionsFromPng(file: File): Promise<{ width: number; height: number } | undefined> {
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength < 24) {
    return undefined
  }
  const bytes = new Uint8Array(buffer, 0, 24)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => bytes[index] === value)) {
    return undefined
  }
  const view = new DataView(buffer)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const pngDimensions = await dimensionsFromPng(file)
  if (pngDimensions) {
    return pngDimensions
  }

  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  }

  throw new ImportError(`${file.name} 无法读取图片尺寸。首版建议使用 PNG 文件。`)
}

async function readRuntimeImage(file: File): Promise<RuntimeImage> {
  const path = pathForFile(file)
  const dimensions = await imageDimensions(file)
  return {
    id: imageIdForFile(file, path),
    name: baseFileName(path),
    path,
    file,
    width: dimensions.width,
    height: dimensions.height,
  }
}

async function readJsonFile(file: File): Promise<string> {
  return file.text()
}

function isImageFile(file: File): boolean {
  const extension = fileExtension(file.name)
  return extension === '.png' || file.type === 'image/png' || file.type.startsWith('image/')
}

function isJsonFile(file: File): boolean {
  return fileExtension(file.name) === '.json' || file.type === 'application/json'
}

function findImageByAtlasName(images: RuntimeImage[], imageName?: string): RuntimeImage | undefined {
  if (!imageName) {
    return undefined
  }
  const target = baseFileName(imageName).toLowerCase()
  return images.find((image) => image.name.toLowerCase() === target)
}

function findNormalAtlasImage(images: RuntimeImage[], colorImage: RuntimeImage): RuntimeImage | undefined {
  const colorStem = stripExtension(colorImage.name).toLowerCase()
  return (
    images.find((image) => {
      const stem = stripExtension(image.name).toLowerCase()
      return stem === `${colorStem}_n` || stem === `${colorStem}_normal`
    }) ??
    images.find((image) => isNormalFileName(image.name)) ??
    images.find((image) => image.id !== colorImage.id)
  )
}

function atlasFrameRef(
  atlas: AtlasData,
  frameIndex: number,
  imageId: string,
  prefix: 'atlas' | 'normal-frame',
): TextureRef {
  const frame = atlas.frames[frameIndex]
  return {
    id: uniqueId(prefix, `${imageId}:${frameIndex}:${frame.name}`),
    name: stripExtension(baseFileName(frame.name)),
    imageId,
    path: `${atlas.imageName ?? 'atlas'}#${frame.name}`,
    rect: frame.rect,
  }
}

function fallbackRectRef(frame: TextureRef, imageId: string, index: number): TextureRef {
  return {
    id: uniqueId('normal-image', `${imageId}:${index}:${frame.name}`),
    name: `${frame.name}_n`,
    imageId,
    path: `${imageId}#${frame.name}`,
    rect: frame.rect,
  }
}

function animationsFromAtlas(
  atlas: AtlasData,
  frames: PreviewFrame[],
  warnings: ImportWarning[],
): AnimationClip[] {
  if (atlas.animations.length === 0) {
    return [
      {
        id: 'clip:default',
        name: 'default',
        frameIds: frames.map((frame) => frame.id),
        fps: 8,
        loop: true,
      },
    ]
  }

  const frameIdByName = new Map(frames.map((frame) => [baseFileName(frame.source.name).toLowerCase(), frame.id]))
  const clips = atlas.animations.flatMap((animation, index) => {
    const frameIds = animation.frameNames.flatMap((name) => {
      const frameId = frameIdByName.get(baseFileName(name).toLowerCase())
      if (!frameId) {
        warnings.push({
          code: 'atlas-animation-frame-missing',
          severity: 'warning',
          message: `动作 ${animation.name} 引用了不存在的帧 ${name}，该引用已跳过。`,
        })
        return []
      }
      return [frameId]
    })
    if (frameIds.length === 0) {
      return []
    }
    return [
      {
        id: `clip:${slugify(animation.name)}:${index}`,
        name: animation.name,
        frameIds,
        fps: 8,
        loop: true,
      } satisfies AnimationClip,
    ]
  })

  return clips.length > 0
    ? clips
    : [
        {
          id: 'clip:default',
          name: 'default',
          frameIds: frames.map((frame) => frame.id),
          fps: 8,
          loop: true,
        },
      ]
}

async function importAtlas(
  jsonFiles: File[],
  imageFiles: File[],
  unsupportedFiles: File[],
): Promise<AssetBundle> {
  const parsedSources: ParsedAtlasSource[] = []
  const warnings: ImportWarning[] = []

  for (const file of jsonFiles) {
    try {
      parsedSources.push({
        fileName: file.name,
        data: parseAtlasJson(await readJsonFile(file), file.name),
      })
    } catch (error) {
      const message = error instanceof AtlasParseError ? error.message : `${file.name} 解析失败。`
      warnings.push({ code: 'atlas-parse-failed', severity: 'error', path: file.name, message })
    }
  }

  if (parsedSources.length === 0) {
    throw new ImportError('没有可用的图集 JSON。请检查 frames 数据结构。')
  }

  const images = await Promise.all(imageFiles.map(readRuntimeImage))
  if (images.length === 0) {
    throw new ImportError('图集 JSON 已找到，但没有可读取的图片文件。')
  }

  const colorSource =
    parsedSources.find((source) => !isNormalFileName(source.fileName)) ?? parsedSources[0]
  const normalSource = parsedSources.find(
    (source) =>
      source !== colorSource &&
      (isNormalFileName(source.fileName) || isNormalFileName(source.data.imageName ?? '')),
  )

  const colorImage =
    findImageByAtlasName(images, colorSource.data.imageName) ??
    images.find((image) => !isNormalFileName(image.name)) ??
    images[0]
  const normalImage =
    findImageByAtlasName(images, normalSource?.data.imageName) ??
    findNormalAtlasImage(images, colorImage)

  if (atlasContainsRotatedFrames(colorSource.data)) {
    warnings.push({
      code: 'rotated-atlas-frame',
      severity: 'error',
      message: '检测到旋转打包帧。首版无法安全共用颜色与法线 UV，请重新以非旋转方式打包。',
    })
  }

  const layoutIssues = normalSource ? validateAtlasLayout(colorSource.data, normalSource.data) : []
  const layoutValid = layoutIssues.length === 0
  if (!layoutValid) {
    warnings.push({
      code: 'atlas-layout-mismatch',
      severity: 'error',
      message: `颜色图集与法线图集布局不一致：${layoutIssues.join(' ')}`,
    })
  }

  const sourceFrames = colorSource.data.frames
  const normalCandidates: TextureRef[] = []
  if (normalImage && layoutValid) {
    if (normalSource) {
      normalSource.data.frames.forEach((_frame, index) => {
        normalCandidates.push(atlasFrameRef(normalSource.data, index, normalImage.id, 'normal-frame'))
      })
    } else {
      sourceFrames.forEach((_frame, index) => {
        const colorRef = atlasFrameRef(colorSource.data, index, colorImage.id, 'atlas')
        normalCandidates.push(fallbackRectRef(colorRef, normalImage.id, index))
      })
    }
  }

  const frames: PreviewFrame[] = sourceFrames.map((frame, index) => {
    const source = atlasFrameRef(colorSource.data, index, colorImage.id, 'atlas')
    const normal = normalCandidates[index]
    const frameId = source.id
    if (!normalImage) {
      warnings.push({
        code: 'missing-normal-atlas',
        severity: 'warning',
        frameId,
        message: `${source.name} 未找到对应法线图集；预览将使用平坦法线。`,
      })
    } else if (!layoutValid) {
      warnings.push({
        code: 'normal-pairing-blocked',
        severity: 'error',
        frameId,
        message: `${source.name} 的法线配对已阻止，请在配对面板中手动校正或重新导出同布局图集。`,
      })
    }

    return {
      id: frameId,
      name: source.name,
      source,
      normal,
      pairingStatus: normal ? 'matched' : layoutIssues.length > 0 ? 'mismatch' : 'missing',
      durationMs: frame.durationMs,
    }
  })

  if (unsupportedFiles.length > 0) {
    warnings.push({
      code: 'unsupported-files',
      severity: 'warning',
      message: `已忽略 ${unsupportedFiles.length} 个不支持的文件。`,
    })
  }

  const fallbackSources = imageFiles.filter((file) => file !== imageFiles[0])
  if (normalImage && !normalSource && parseNormalFallbackAvailable(fallbackSources)) {
    warnings.push({
      code: 'assumed-normal-layout',
      severity: 'warning',
      message: '法线图集没有 JSON，已按颜色图集的尺寸与 UV 布局进行配对，请人工确认。',
    })
  }

  return analyzeBundlePalette({
    id: `bundle:${Date.now()}`,
    mode: 'atlas',
    sourceName: jsonFiles.map((file) => file.name).join(', '),
    importedAt: new Date().toISOString(),
    images,
    frames,
    animations: animationsFromAtlas(colorSource.data, frames, warnings),
    normalCandidates,
    paletteMode: 'fullcolor',
    paletteSources: [],
    metadataFiles: jsonFiles.map((file) => ({ name: file.name, file })),
    warnings,
  })
}

function parseNormalFallbackAvailable(files: File[]): boolean {
  return files.some((file) => isNormalFileName(file.name))
}

async function importFrames(
  imageFiles: File[],
  unsupportedFiles: File[],
): Promise<AssetBundle> {
  const images = await Promise.all(imageFiles.map(readRuntimeImage))
  const colorImages = images.filter((image) => !isNormalFileName(image.name))
  const normalImages = images.filter((image) => isNormalFileName(image.name))

  if (colorImages.length === 0) {
    throw new ImportError('没有找到不含 _n/_normal 后缀的精灵颜色图。')
  }

  const paired = pairFrameImages(colorImages, normalImages)
  const warnings = [...paired.warnings]

  if (unsupportedFiles.length > 0) {
    warnings.push({
      code: 'unsupported-files',
      severity: 'warning',
      message: `已忽略 ${unsupportedFiles.length} 个不支持的文件。`,
    })
  }

  return analyzeBundlePalette({
    id: `bundle:${Date.now()}`,
    mode: 'frames',
    sourceName: colorImages.length === 1 ? colorImages[0].name : `${colorImages.length} 张逐帧图片`,
    importedAt: new Date().toISOString(),
    images,
    frames: paired.frames,
    animations: groupFramesIntoAnimations(paired.frames),
    normalCandidates: paired.normalCandidates,
    paletteMode: 'fullcolor',
    paletteSources: [],
    warnings,
  })
}

export async function importFiles(files: File[]): Promise<AssetBundle> {
  const supported = files.filter((file) => isImageFile(file) || isJsonFile(file))
  const unsupported = files.filter((file) => !supported.includes(file))
  const imageFiles = supported.filter(isImageFile)
  const jsonFiles = supported.filter(isJsonFile)

  if (imageFiles.length === 0) {
    throw new ImportError('没有找到可导入的 PNG 图片。')
  }

  if (jsonFiles.length > 0) {
    return importAtlas(jsonFiles, imageFiles, unsupported)
  }

  return importFrames(imageFiles, unsupported)
}

export function updateFrameNormal(
  bundle: AssetBundle,
  frameId: string,
  candidate: TextureRef | undefined,
): AssetBundle {
  const frames = bundle.frames.map((frame) =>
    frame.id === frameId
      ? {
          ...frame,
          normal: candidate,
          pairingStatus: candidate ? ('manual' as const) : ('missing' as const),
        }
      : frame,
  )
  return { ...bundle, frames }
}

export function collectCurrentWarnings(bundle: AssetBundle): ImportWarning[] {
  const base = bundle.warnings.filter(
    (warning) =>
      !['missing-normal', 'normal-pairing-blocked', 'missing-normal-atlas'].includes(warning.code),
  )
  const frameWarnings: ImportWarning[] = bundle.frames.flatMap((frame) =>
    frame.normal
      ? []
      : [
          {
            code: frame.pairingStatus === 'mismatch' ? 'normal-pairing-blocked' : 'missing-normal',
            severity: frame.pairingStatus === 'mismatch' ? ('error' as const) : ('warning' as const),
            frameId: frame.id,
            message:
              frame.pairingStatus === 'mismatch'
                ? `${frame.name} 的法线配对被阻止，请手动校正。`
                : `${frame.name} 未配对法线图，预览将使用平坦法线。`,
          },
        ],
  )
  return [...base, ...frameWarnings]
}