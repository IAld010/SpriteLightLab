declare module 'gifenc' {
  export type GifPalette = number[][]

  export interface GifWriteFrameOptions {
    palette?: GifPalette
    delay?: number
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    first?: boolean
    dispose?: number
  }

  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifWriteFrameOptions): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
    finish(): void
  }

  export interface GifQuantizeOptions {
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: GifQuantizeOptions,
  ): GifPalette
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array
}

declare module 'upng-js' {
  export interface UpngImage {
    width: number
    height: number
    depth: number
    ctype: number
    frames: unknown[]
    data: Uint8Array
  }

  export interface UpngModule {
    encode(
      buffers: ArrayBuffer[],
      width: number,
      height: number,
      colors: number,
      delays?: number[],
    ): ArrayBuffer
    decode(buffer: ArrayBuffer): UpngImage
    toRGBA8(image: UpngImage): ArrayBuffer[]
  }

  const UPNG: UpngModule
  export default UPNG
  export const encode: UpngModule['encode']
  export const decode: UpngModule['decode']
  export const toRGBA8: UpngModule['toRGBA8']
}
