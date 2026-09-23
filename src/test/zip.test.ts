import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from '../domain/binary'
import { createZip, isZipArchive, readZip, zipEntryText } from '../domain/zip'

describe('portable binary helpers', () => {
  it('round-trips base64 data', () => {
    const bytes = textToBytes('sprite-light-lab')
    expect(bytesToText(base64ToBytes(bytesToBase64(bytes)))).toBe('sprite-light-lab')
  })

  it('creates and reads a ZIP archive', () => {
    const zip = createZip([
      { name: 'project.json', data: textToBytes('{"version":1}') },
      { name: 'assets/hero.png', data: new Uint8Array([137, 80, 78, 71]) },
    ])
    const entries = readZip(zip)

    expect(entries).toHaveLength(2)
    expect(zipEntryText(entries[0])).toBe('{"version":1}')
    expect([...entries[1].data]).toEqual([137, 80, 78, 71])
  })

  it('detects archives by signature rather than by file name', () => {
    const zip = createZip([{ name: 'project.json', data: textToBytes('{"version":3}') }])
    expect(isZipArchive(zip)).toBe(true)
    expect(isZipArchive(textToBytes('{"format":"sprite-light-lab-portable"}'))).toBe(false)
    expect(isZipArchive(new Uint8Array([0x50, 0x4b]))).toBe(false)
    expect(isZipArchive(new Uint8Array())).toBe(false)
    expect(isZipArchive(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(true)
  })
})