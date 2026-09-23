/**
 * Ambient types for the packages the end-to-end suite decodes with.
 * `upng-js` ships no declarations, and its default export is the UPNG namespace object.
 */
declare module 'upng-js' {
  const UPNG: {
    decode(buffer: ArrayBuffer): unknown
    toRGBA8(image: unknown): ArrayBuffer[]
    encode(
      buffers: ArrayBuffer[],
      width: number,
      height: number,
      colours: number,
      delays?: number[],
    ): ArrayBuffer
  }

  export default UPNG
}
