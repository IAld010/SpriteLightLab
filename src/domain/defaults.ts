import type { LightSource, LightingState, RenderPreferences } from './types'

function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `${prefix}:${random}`
}

export function createDefaultLighting(): LightingState {
  const directional: LightSource = {
    id: makeId('light'),
    name: '主方向光',
    type: 'directional',
    enabled: true,
    color: '#ffd9a6',
    intensity: 0.9,
    direction: 225,
  }
  return {
    ambientColor: '#ffffff',
    ambientIntensity: 0.34,
    lights: [directional],
    selectedLightId: directional.id,
  }
}

export function normalizeLightingState(lighting?: LightingState): LightingState {
  if (!lighting) return createDefaultLighting()
  const lights = (lighting.lights ?? [])
    .filter((light) => light.type === 'directional')
    .map((light) => ({
      id: light.id,
      name: light.name,
      type: 'directional' as const,
      enabled: light.enabled,
      color: light.color,
      intensity: light.intensity,
      direction: light.direction,
    }))
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