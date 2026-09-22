import { Application, Sprite, Texture } from 'pixi.js'
import type {
  ActionAlignment,
  AssetBundle,
  BackendPreference,
  FrameAlignment,
  LightingState,
  PaletteMode,
  PalettePreset,
  PreviewBackground,
  PreviewFrame,
  PreviewTextureMode,
  RenderPreferences,
  RuntimeImage,
} from '../domain/types'
import { renderCpuSprite } from './CpuSpriteRenderer'
import { computePreviewLayout, type PreviewLayout } from './previewLayout'
import { registerPreviewExporter, unregisterPreviewExporter, type PreviewExporter } from './previewExportRegistry'

export interface PreviewAppearance {
  paletteMode: PaletteMode
  paletteSources: string[]
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
}

interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

export class PreviewRenderer implements PreviewExporter {
  private app?: Application
  private sprite?: Sprite
  private host?: HTMLElement
  private imageDataCache = new Map<string, ImageData>()
  private indexDataCache = new Map<string, ImageData>()
  private outputCanvas?: HTMLCanvasElement
  private outputTexture?: Texture
  private currentColor?: ImageData
  private currentNormal?: ImageData
  private currentIndex?: ImageData
  private currentFrameRect: FrameRect = { x: 0, y: 0, width: 1, height: 1 }
  private appearance?: PreviewAppearance
  private frameAlignment?: FrameAlignment
  private actionAlignment?: ActionAlignment
  private textureMode: PreviewTextureMode = 'color'
  private zoom = 1
  private panX = 0
  private panY = 0
  private previewLayout?: PreviewLayout
  private currentToken = 0
  private resizeHandler = () => {
    void this.renderFrame()
  }

  private readonly bundle: AssetBundle
  readonly backend: BackendPreference

  private constructor(bundle: AssetBundle, backend: BackendPreference) {
    this.bundle = bundle
    this.backend = backend
  }

  static async create(
    host: HTMLElement,
    bundle: AssetBundle,
    backend: BackendPreference,
    options: {
      textureMode: PreviewTextureMode
      background: PreviewBackground
      zoom: number
      panX: number
      panY: number
    },
  ): Promise<PreviewRenderer> {
    const renderer = new PreviewRenderer(bundle, backend)
    renderer.textureMode = options.textureMode
    renderer.zoom = options.zoom
    renderer.panX = options.panX
    renderer.panY = options.panY
    renderer.setBackground(options.background, host)
    await renderer.mount(host)
    return renderer
  }

  private async mount(host: HTMLElement): Promise<void> {
    this.host = host
    const app = new Application()
    await app.init({
      resizeTo: host,
      preference: this.backend,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      backgroundAlpha: 0,
      hello: false,
    })
    this.app = app
    registerPreviewExporter(this)
    app.canvas.setAttribute('aria-label', 'Sprite preview')
    app.canvas.style.display = 'block'
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    host.appendChild(app.canvas)
    app.renderer.on('resize', this.resizeHandler)
  }

  async setFrame(
    frame: PreviewFrame | undefined,
    textureMode = this.textureMode,
    frameAlignment?: FrameAlignment,
    actionAlignment?: ActionAlignment,
  ): Promise<void> {
    if (!this.app) return
    this.textureMode = textureMode
    this.frameAlignment = frameAlignment
    this.actionAlignment = actionAlignment
    const token = ++this.currentToken
    if (!frame) {
      this.clearSprite()
      return
    }

    const sourceImage = this.bundle.images.find((image) => image.id === frame.source.imageId)
    if (!sourceImage) throw new Error(`Missing texture source ${frame.source.name}`)
    const normalImage = frame.normal
      ? this.bundle.images.find((image) => image.id === frame.normal?.imageId)
      : undefined
    const [color, normal, index] = await Promise.all([
      this.loadImageData(sourceImage),
      normalImage ? this.loadImageData(normalImage) : Promise.resolve(this.getFlatNormal()),
      this.loadIndexDataForFrame(frame),
    ])
    if (token !== this.currentToken || !this.app) return

    this.currentColor = color
    this.currentNormal = normal
    this.currentIndex = index
    this.currentFrameRect = {
      x: frame.source.rect?.x ?? 0,
      y: frame.source.rect?.y ?? 0,
      width: frame.source.rect?.width ?? sourceImage.width,
      height: frame.source.rect?.height ?? sourceImage.height,
    }

    this.layout()
    const canvas = this.renderFrameCanvas()
    const texture = this.updateOutputTexture(canvas)
    if (!this.sprite) {
      this.sprite = new Sprite(texture)
      this.sprite.anchor.set(0.5)
      this.app.stage.addChild(this.sprite)
    } else {
      this.sprite.texture = texture
    }
    this.sprite.roundPixels = this.appearance?.preferences.pixelPerfect ?? true
    this.layout()
  }

  updateAppearance(appearance: PreviewAppearance): void {
    this.appearance = appearance
    if (this.sprite) this.sprite.roundPixels = appearance.preferences.pixelPerfect
    void this.renderFrame()
  }

  setZoom(zoom: number): void {
    this.zoom = zoom
    this.updateView()
  }

  setPan(x: number, y: number): void {
    this.panX = x
    this.panY = y
    this.updateView()
  }

  setTextureMode(mode: PreviewTextureMode): void {
    this.textureMode = mode
    void this.renderFrame()
  }

  setBackground(background: PreviewBackground, host = this.host): void {
    if (host) host.dataset.background = background
  }

  getBackendLabel(): string {
    if (!this.app) return this.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'
    return this.app.renderer.name === 'webgpu' ? 'WebGPU' : 'WebGL2'
  }

  private async renderFrame(): Promise<void> {
    if (!this.app || !this.sprite || !this.currentColor) return
    this.layout()
    this.sprite.texture = this.updateOutputTexture(this.renderFrameCanvas())
    this.layout()
  }

  private updateView(): void {
    void this.renderFrame()
  }

  private updateOutputTexture(source: HTMLCanvasElement): Texture {
    if (!this.outputCanvas || this.outputCanvas.width !== source.width || this.outputCanvas.height !== source.height) {
      this.outputCanvas = document.createElement('canvas')
      this.outputCanvas.width = source.width
      this.outputCanvas.height = source.height
      this.outputTexture = Texture.from(this.outputCanvas)
      this.outputTexture.source.style.scaleMode = 'nearest'
      this.outputTexture.source.style.addressMode = 'clamp-to-edge'
    }
    const context = this.outputCanvas.getContext('2d')
    if (!context) throw new Error('Unable to create output canvas.')
    context.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height)
    context.drawImage(source, 0, 0)
    this.outputTexture?.source.update()
    return this.outputTexture!
  }

  private renderFrameCanvas(): HTMLCanvasElement {
    if (!this.currentColor || !this.currentNormal || !this.currentIndex) {
      throw new Error('No frame is loaded.')
    }
    const maxPreviewDimension = 1024
    const scale = Math.min(
      1,
      maxPreviewDimension / Math.max(this.currentFrameRect.width, this.currentFrameRect.height),
    )
    const width = Math.max(1, Math.round(this.currentFrameRect.width * scale))
    const height = Math.max(1, Math.round(this.currentFrameRect.height * scale))
    return renderCpuSprite({
      color: this.currentColor,
      normal: this.currentNormal,
      index: this.currentIndex,
      frame: this.currentFrameRect,
      outputWidth: width,
      outputHeight: height,
      paletteMode: this.appearance?.paletteMode ?? 'fullcolor',
      paletteSources: this.appearance?.paletteSources ?? [],
      palette: this.appearance?.palette ?? {
        id: 'default',
        name: 'default',
        entries: [],
        rules: [],
        adjustments: {
          hue: 0,
          saturation: 1,
          lightness: 0,
          contrast: 1,
          tint: '#ffffff',
          tintStrength: 0,
        },
      },
      lighting: this.appearance?.lighting ?? {
        ambientColor: '#ffffff',
        ambientIntensity: 0.35,
        lights: [],
      },
      preferences: this.appearance?.preferences ?? {
        lightingEnabled: false,
        normalStrength: 1,
        flipGreen: false,
        specularEnabled: false,
        specularStrength: 0.35,
        pixelPerfect: true,
      },
      objectRect: this.objectRect(),
      debugNormal: this.textureMode === 'normal',
    })
  }

  private objectRect(): [number, number, number, number] {
    return this.previewLayout?.objectRect ?? [0, 0, 1, 1]
  }

  private layout(): void {
    if (!this.app) return
    const width = this.app.renderer.width
    const height = this.app.renderer.height
    const { width: outputWidth, height: outputHeight } = this.outputDimensions()
    const textureWidth = Math.max(1, this.sprite?.texture.width ?? outputWidth)
    const textureHeight = Math.max(1, this.sprite?.texture.height ?? outputHeight)
    const layout = computePreviewLayout({
      viewportWidth: width,
      viewportHeight: height,
      textureWidth,
      textureHeight,
      frameWidth: this.currentFrameRect.width,
      frameHeight: this.currentFrameRect.height,
      frameAlignment: this.frameAlignment,
      actionAlignment: this.actionAlignment,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    })
    this.previewLayout = layout
    if (!this.sprite) return
    this.sprite.anchor.set(layout.anchorX, layout.anchorY)
    this.sprite.scale.set(layout.displayScale)
    this.sprite.position.set(layout.displayX, layout.displayY)
  }

  private outputDimensions(): { width: number; height: number } {
    const maxPreviewDimension = 1024
    const scale = Math.min(
      1,
      maxPreviewDimension / Math.max(this.currentFrameRect.width, this.currentFrameRect.height),
    )
    return {
      width: Math.max(1, Math.round(this.currentFrameRect.width * scale)),
      height: Math.max(1, Math.round(this.currentFrameRect.height * scale)),
    }
  }

  private async loadImageData(image: RuntimeImage): Promise<ImageData> {
    const cached = this.imageDataCache.get(image.id)
    if (cached) return cached
    const bitmap = await createImageBitmap(image.file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Unable to create image cache.')
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, image.width, image.height)
      this.imageDataCache.set(image.id, data)
      return data
    } finally {
      bitmap.close()
    }
  }

  private async loadIndexDataForFrame(frame: PreviewFrame): Promise<ImageData> {
    if (this.bundle.paletteMode !== 'indexed' || this.bundle.paletteSources.length === 0) {
      return this.getDummyIndex()
    }
    const sourceImage = this.bundle.images.find((image) => image.id === frame.source.imageId)
    if (!sourceImage) return this.getDummyIndex()
    const cached = this.indexDataCache.get(sourceImage.id)
    if (cached) return cached
    const colorData = await this.loadImageData(sourceImage)
    const output = new ImageData(sourceImage.width, sourceImage.height)
    const indexByColor = new Map<number, number>()
    this.bundle.paletteSources.forEach((source, index) => {
      const value = Number.parseInt(source.slice(1), 16)
      indexByColor.set(value, Math.min(index, 255))
    })
    for (let offset = 0; offset < colorData.data.length; offset += 4) {
      if (colorData.data[offset + 3] < 8) continue
      const key =
        (colorData.data[offset] << 16) |
        (colorData.data[offset + 1] << 8) |
        colorData.data[offset + 2]
      const index = indexByColor.get(key) ?? 0
      output.data[offset] = index
      output.data[offset + 1] = index
      output.data[offset + 2] = index
      output.data[offset + 3] = colorData.data[offset + 3]
    }
    this.indexDataCache.set(sourceImage.id, output)
    return output
  }

  private getFlatNormal(): ImageData {
    return new ImageData(new Uint8ClampedArray([128, 128, 255, 255]), 1, 1)
  }

  private getDummyIndex(): ImageData {
    return new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1)
  }

  private clearSprite(): void {
    if (!this.sprite) return
    this.sprite.parent?.removeChild(this.sprite)
    this.sprite.destroy({ children: true, texture: false, textureSource: false })
    this.sprite = undefined
    this.previewLayout = undefined
  }

  async exportViewportPng(): Promise<Blob> {
    if (!this.app) throw new Error('Preview renderer is not initialized.')
    const canvas = this.app.renderer.extract.canvas({
      target: this.app.stage,
      clearColor: this.backgroundClearColor(),
      resolution: 1,
      antialias: false,
    })
    return canvasToBlob(canvas as HTMLCanvasElement)
  }

  async exportFramePng(): Promise<Blob> {
    if (!this.currentColor) throw new Error('No sprite frame is available.')
    const canvas = this.renderFrameCanvas()
    return canvasToBlob(canvas)
  }

  private backgroundClearColor(): [number, number, number, number] {
    const background = this.host?.dataset.background
    if (background === 'light') return [0.81, 0.84, 0.89, 1]
    if (background === 'dark') return [0.03, 0.04, 0.06, 1]
    return [0.07, 0.09, 0.13, 1]
  }

  destroy(): void {
    this.currentToken += 1
    unregisterPreviewExporter(this)
    this.clearSprite()
    if (this.app) {
      this.app.renderer.off('resize', this.resizeHandler)
      this.app.destroy(true, { children: true, texture: false, textureSource: false })
      this.app = undefined
    }
    this.outputTexture?.destroy(true)
    this.outputTexture = undefined
    this.outputCanvas = undefined
    this.imageDataCache.clear()
    this.indexDataCache.clear()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to create PNG.'))
    }, 'image/png')
  })
}