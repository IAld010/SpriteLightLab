import type { LightSource, LightType, LightingState, RenderPreferences } from './types'

function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `${prefix}:${random}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isLightType(value: unknown): value is LightType {
  return value === 'directional' || value === 'point' || value === 'spot'
}

function normalizeLight(light: LightSource, index: number): LightSource {
  const legacy = light as LightSource & { innerAngle?: number; outerAngle?: number }
  const legacyOuterAngle =
    typeof legacy.outerAngle === 'number' ? clamp(legacy.outerAngle * 2, 1, 179) : 52
  const legacyInnerAngle =
    typeof legacy.innerAngle === 'number' ? clamp(legacy.innerAngle * 2, 0, legacyOuterAngle) : 26
  return {
    id: light.id || makeId('light'),
    name: light.name || `光源 ${index + 1}`,
    type: light.type,
    enabled: light.enabled !== false,
    handleVisible: light.handleVisible !== false,
    color: light.color || '#ffffff',
    intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
    x: clamp(Number.isFinite(light.x) ? light.x : 0.5, 0, 1),
    y: clamp(Number.isFinite(light.y) ? light.y : 0.5, 0, 1),
    direction: Number.isFinite(light.direction) ? light.direction : 225,
    radius: clamp(Number.isFinite(light.radius) ? light.radius : 0.6, 0.02, 2),
    falloff: clamp(Number.isFinite(light.falloff) ? light.falloff : 20, 0.1, 40),
    coneAngle: clamp(
      Number.isFinite(light.coneAngle) ? light.coneAngle : legacyOuterAngle,
      1,
      179,
    ),
    softness: clamp(
      Number.isFinite(light.softness)
        ? light.softness
        : legacyOuterAngle > 0
          ? 1 - legacyInnerAngle / legacyOuterAngle
          : 0.35,
      0,
      1,
    ),
  }
}

export function createDefaultLighting(): LightingState {
  const directional: LightSource = {
    id: makeId('light'),
    name: '主方向光',
    type: 'directional',
    enabled: true,
    handleVisible: true,
    color: '#ffd9a6',
    intensity: 0.9,
    x: 0.5,
    y: 0.5,
    direction: 225,
    radius: 0.6,
    falloff: 20,
    coneAngle: 52,
    softness: 0.5,
  }
  const point: LightSource = {
    id: makeId('light'),
    name: '暖色点光',
    type: 'point',
    enabled: true,
    handleVisible: true,
    color: '#ff8a4c',
    intensity: 1.1,
    x: 0.72,
    y: 0.3,
    direction: 180,
    radius: 0.68,
    falloff: 20,
    coneAngle: 52,
    softness: 0.5,
  }
  return {
    ambientColor: '#ffffff',
    ambientIntensity: 0.34,
    lights: [directional, point],
    selectedLightId: point.id,
  }
}

export function normalizeLightingState(lighting?: LightingState): LightingState {
  if (!lighting) return createDefaultLighting()
  const lights = (lighting.lights ?? [])
    .filter((light) => isLightType(light.type))
    .map(normalizeLight)
  const selectedLightId = lights.some((light) => light.id === lighting.selectedLightId)
    ? lighting.selectedLightId
    : lights[0]?.id
  return {
    ambientColor: lighting.ambientColor,
    ambientIntensity: lighting.ambientIntensity,
    lights,
    ...(selectedLightId ? { selectedLightId } : {}),
  }
}

export function createDefaultPreferences(): RenderPreferences {
  return {
    lightingEnabled: true,
    normalStrength: 1,
    flipGreen: false,
    specularEnabled: false,
    specularStrength: 0.35,
    pixelPerfect: true,
  }
}