export type ImportMode = 'frames' | 'atlas' | 'grid' | 'regions'
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

export type RegionBackgroundMode = 'transparent' | 'color'

export interface RegionImportConfig {
  alphaThreshold: number
  backgroundMode: RegionBackgroundMode
  backgroundColor: string
  colorTolerance: number
  minRegionWidth: number
  minRegionHeight: number
  mergeDistance: number
  padding: number
  frameOrder: 'row-major' | 'column-major'
  regions: Rect[]
}

export interface GridImportConfig {
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  offsetX: number
  offsetY: number
  spacingX: number
  spacingY: number
  frameOrder: 'row-major' | 'column-major'
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

export type AnchorPreset = 'center' | 'bottom-center' | 'manual'
export type AnchorSnapMode = 'pixel-center' | 'pixel-boundary' | 'free'

export interface FrameAlignment {
  pivotX: number
  pivotY: number
  offsetX: number
  offsetY: number
}

export interface ActionAlignment {
  canvasWidth: number
  canvasHeight: number
  anchorX: number
  anchorY: number
  scale: number
}

export interface PreviewFrame {
  id: string
  name: string
  source: TextureRef
  normal?: TextureRef
  pairingStatus: PairingStatus
  note?: string
  durationMs?: number
  alignment?: FrameAlignment
}

export type SpeedKeyInterpolation = 'linear' | 'smooth' | 'stepped'

export interface SpeedKeyframe {
  id: string
  time: number
  value: number
  inTangent: number
  outTangent: number
  interpolation: SpeedKeyInterpolation
}

export interface SpeedCurve {
  version: 1
  keyframes: SpeedKeyframe[]
  preserveTotalDuration: boolean
}

export interface AnimationTiming {
  speedCurve: SpeedCurve
}

export interface AnimationClip {
  id: string
  name: string
  frameIds: string[]
  fps: number
  loop: boolean
  alignment?: ActionAlignment
  timing?: AnimationTiming
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
  gridConfig?: GridImportConfig
  regionConfig?: RegionImportConfig
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
  /** Whether this light's canvas position control is visible. */
  handleVisible: boolean
  color: string
  intensity: number
  /**
   * Position inside the checkerboard preview area, normalized to 0..1.
   * Used by point and spot lights.
   */
  x: number
  y: number
  direction: number
  /** Radius relative to the checkerboard area width. */
  radius: number
  /** Quadratic attenuation coefficient inspired by PixiJS Lights. */
  falloff: number
  /** Full spotlight cone angle in degrees. */
  coneAngle: number
  /** 0 = hard edge, 1 = fully soft edge. */
  softness: number
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

export interface ProjectDocumentV2 extends Omit<ProjectDocumentV1, 'version'> {
  version: 2
  gridConfig?: GridImportConfig
  regionConfig?: RegionImportConfig
}

export type ProjectDocument = ProjectDocumentV1 | ProjectDocumentV2
