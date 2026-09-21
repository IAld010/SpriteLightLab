export type ImportMode = 'frames' | 'atlas'
export type PairingStatus = 'matched' | 'manual' | 'missing' | 'mismatch'
export type BackendPreference = 'webgl' | 'webgpu'
export type PreviewTextureMode = 'color' | 'normal'
export type PreviewBackground = 'checker' | 'dark' | 'light'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface RuntimeImage {
  id: string
  name: string
  path: string
  file: File
  width: number
  height: number
}

export interface TextureRef {
  id: string
  name: string
  imageId: string
  path?: string
  rect?: Rect
}

export interface PreviewFrame {
  id: string
  name: string
  source: TextureRef
  normal?: TextureRef
  pairingStatus: PairingStatus
  note?: string
  durationMs?: number
}

export interface AnimationClip {
  id: string
  name: string
  frameIds: string[]
  fps: number
  loop: boolean
}

export type WarningSeverity = 'warning' | 'error'

export interface ImportWarning {
  code: string
  message: string
  severity: WarningSeverity
  frameId?: string
  path?: string
}

export interface AssetBundle {
  id: string
  mode: ImportMode
  sourceName: string
  importedAt: string
  images: RuntimeImage[]
  frames: PreviewFrame[]
  animations: AnimationClip[]
  normalCandidates: TextureRef[]
  paletteMode: PaletteMode
  paletteSources: string[]
  metadataFiles?: Array<{ name: string; file: File }>
  warnings: ImportWarning[]
}

export interface AtlasFrameData {
  name: string
  rect: Rect
  durationMs?: number
  rotated?: boolean
}

export interface AtlasAnimationData {
  name: string
  frameNames: string[]
}

export interface AtlasData {
  schema: 'aseprite' | 'texturepacker' | 'unknown'
  imageName?: string
  size?: { width: number; height: number }
  frames: AtlasFrameData[]
  animations: AtlasAnimationData[]
}

export interface ImportProgress {
  label: string
  value: number
}

export interface EditorSettings {
  backend: BackendPreference
  textureMode: PreviewTextureMode
  background: PreviewBackground
  zoom: number
  panX: number
  panY: number
}
export type PaletteMode = 'indexed' | 'fullcolor'
export type LightType = 'directional' | 'point' | 'spot'

export interface PaletteEntry {
  source: string
  target: string
}

export interface ColorAdjustments {
  hue: number
  saturation: number
  lightness: number
  contrast: number
  tint: string
  tintStrength: number
}

export interface ColorRule {
  id: string
  source: string
  target: string
  tolerance: number
  enabled: boolean
}

export interface PalettePreset {
  id: string
  name: string
  entries: PaletteEntry[]
  rules: ColorRule[]
  adjustments: ColorAdjustments
}

export interface LightSource {
  id: string
  name: string
  type: LightType
  enabled: boolean
  color: string
  intensity: number
  x: number
  y: number
  direction: number
  radius: number
  innerAngle: number
  outerAngle: number
  falloff: number
}

export interface LightingState {
  ambientColor: string
  ambientIntensity: number
  lights: LightSource[]
  selectedLightId?: string
}

export interface RenderPreferences {
  lightingEnabled: boolean
  normalStrength: number
  flipGreen: boolean
  specularEnabled: boolean
  specularStrength: number
  pixelPerfect: boolean
}

export interface UndoSnapshot {
  palettePresets: PalettePreset[]
  activePaletteId: string
  lighting: LightingState
  renderPreferences: RenderPreferences
}

export interface ProjectDocumentV1 {
  version: 1
  projectName: string
  createdAt: string
  sourceMode: ImportMode
  sourceName: string
  assets: Array<{ path: string; name: string; kind: 'image' | 'json' }>
  frames: PreviewFrame[]
  animations: AnimationClip[]
  normalPairing: Array<{ frameId: string; normalId?: string }>
  paletteSources: string[]
  paletteMode: PaletteMode
  palettePresets: PalettePreset[]
  activePaletteId: string
  lighting: LightingState
  renderPreferences: RenderPreferences
  settings: EditorSettings
}