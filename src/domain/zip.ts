import { bytesToText, textToBytes } from './binary'

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[index] = crc >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function writeUint16(target: DataView, offset: number, value: number): void {
  target.setUint16(offset, value, true)
}

function writeUint32(target: DataView, offset: number, value: number): void {
  target.setUint32(offset, value >>> 0, true)
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const name = textToBytes(entry.name.replaceAll('\\', '/'))
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    writeUint32(localView, 0, 0x04034b50)
    writeUint16(localView, 4, 20)
    writeUint16(localView, 6, 0x0800)
    writeUint16(localView, 8, 0)
    writeUint16(localView, 10, 0)
    writeUint16(localView, 12, 0)
    writeUint32(localView, 14, crc)
    writeUint32(localView, 18, entry.data.length)
    writeUint32(localView, 22, entry.data.length)
    writeUint16(localView, 26, name.length)
    writeUint16(localView, 28, 0)
    local.set(name, 30)
    localChunks.push(local, entry.data)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0x0800)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, 0)
    writeUint16(centralView, 14, 0)
    writeUint32(centralView, 16, crc)
    writeUint32(centralView, 20, entry.data.length)
    writeUint32(centralView, 24, entry.data.length)
    writeUint16(centralView, 28, name.length)
    writeUint16(centralView, 30, 0)
    writeUint16(centralView, 32, 0)
    writeUint16(centralView, 34, 0)
    writeUint16(centralView, 36, 0)
    writeUint32(centralView, 38, 0)
    writeUint32(centralView, 42, localOffset)
    central.set(name, 46)
    centralChunks.push(central)

    localOffset += local.length + entry.data.length
  }

  const centralDirectory = concat(centralChunks)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, entries.length)
  writeUint16(endView, 10, entries.length)
  writeUint32(endView, 12, centralDirectory.length)
  writeUint32(endView, 16, localOffset)
  writeUint16(endView, 20, 0)

  return concat([...localChunks, centralDirectory, end])
}

/** True when the bytes start with a ZIP signature; file extensions cannot be trusted. */
export function isZipArchive(input: ArrayBuffer | Uint8Array): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 4) return false
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  const third = bytes[2]
  const fourth = bytes[3]
  return (
    (third === 0x03 && fourth === 0x04) ||
    (third === 0x05 && fourth === 0x06) ||
    (third === 0x07 && fourth === 0x08)
  )
}

export async function readZipAsync(input: ArrayBuffer | Uint8Array): Promise<ZipEntry[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize
    const name = bytesToText(bytes.subarray(nameStart, nameEnd))

    if (flags & 0x08) {
      throw new Error('ZIP entry ' + name + ' uses an unsupported data descriptor.')
    }
    const compressed = bytes.slice(dataStart, dataEnd)
    let data: Uint8Array
    if (method === 0) {
      data = compressed
    } else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress Deflate ZIP entries.')
      }
      const stream = new Blob([compressed.slice().buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
      data = new Uint8Array(await new Response(stream).arrayBuffer())
    } else {
      throw new Error('ZIP entry ' + name + ' uses unsupported compression method ' + method + '.')
    }

    entries.push({ name, data })
    offset = dataEnd
  }

  if (entries.length === 0) {
    throw new Error('ZIP contains no readable local file entries.')
  }
  return entries
}

export function readZip(input: ArrayBuffer | Uint8Array): ZipEntry[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize
    const name = bytesToText(bytes.subarray(nameStart, nameEnd))

    if (method !== 0) {
      throw new Error(`ZIP 条目 ${name} 使用了不支持的压缩方式 ${method}。`)
    }
    if (flags & 0x08) {
      throw new Error(`ZIP 条目 ${name} 使用了不支持的数据描述符。`)
    }

    entries.push({ name, data: bytes.slice(dataStart, dataEnd) })
    offset = dataEnd
  }

  if (entries.length === 0) {
    throw new Error('ZIP 中没有可读取的本地文件条目。')
  }
  return entries
}

export function zipEntryText(entry: ZipEntry): string {
  return bytesToText(entry.data)
}