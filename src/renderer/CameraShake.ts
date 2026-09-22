import type { CameraShakePayload } from '../domain/types'

export interface CameraShakeTransform {
  x: number
  y: number
  rotation: number
  scale: number
}

function seededNoise(seed: number, time: number): number {
  const value = Math.sin((seed * 12.9898 + time * 78.233) * 0.01745329252) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

export class CameraShake {
  private trauma = 0
  private durationMs = 220
  private frequency = 28
  private decay = 0.08
  private payload?: CameraShakePayload
  private elapsedMs = 0

  trigger(payload: CameraShakePayload): void {
    this.payload = payload
    this.trauma = Math.min(1, this.trauma + payload.strength)
    this.durationMs = Math.max(20, payload.durationMs)
    this.frequency = Math.max(1, payload.frequency)
    this.decay = Math.max(0.001, payload.decay)
    this.elapsedMs = 0
  }

  update(deltaMs: number): CameraShakeTransform | undefined {
    if (!this.payload || this.trauma <= 0) return undefined
    this.elapsedMs += deltaMs
    const deltaSeconds = deltaMs / 1000
    const amplitude = this.trauma * this.trauma
    const phase = this.elapsedMs / 1000 * this.frequency
    const fade = Math.max(0, 1 - this.elapsedMs / this.durationMs)
    const offset = amplitude * fade * 18
    const payload = this.payload
    const transform = {
      x: seededNoise(payload.seed, phase) * offset * payload.xWeight,
      y: seededNoise(payload.seed + 17, phase + 0.31) * offset * payload.yWeight,
      rotation: seededNoise(payload.seed + 31, phase + 0.73) * amplitude * fade * 0.035 * payload.rotationWeight,
      scale: 1 + seededNoise(payload.seed + 47, phase + 1.13) * amplitude * fade * 0.025 * payload.scaleWeight,
    }
    this.trauma = Math.max(0, this.trauma - this.decay * deltaSeconds)
    if (this.elapsedMs >= this.durationMs || this.trauma <= 0.001) {
      this.trauma = 0
      this.payload = undefined
    }
    return transform
  }

  reset(): void {
    this.trauma = 0
    this.payload = undefined
    this.elapsedMs = 0
  }
}
