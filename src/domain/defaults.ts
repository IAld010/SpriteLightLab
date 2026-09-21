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
    x: 0.5,
    y: 0.5,
    direction: 225,
    radius: 0.6,
    innerAngle: 30,
    outerAngle: 55,
    falloff: 2,
  }
  const point: LightSource = {
    id: makeId('light'),
    name: '暖色点光',
    type: 'point',
    enabled: true,
    color: '#ff8a4c',
    intensity: 1.1,
    x: 0.72,
    y: 0.3,
    direction: 180,
    radius: 0.38,
    innerAngle: 30,
    outerAngle: 55,
    falloff: 2,
  }
  return {
    ambientColor: '#ffffff',
    ambientIntensity: 0.34,
    lights: [directional, point],
    selectedLightId: point.id,
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