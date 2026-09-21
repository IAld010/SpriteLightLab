import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from '../domain/binary'
import { createZip, readZip, zipEntryText } from '../domain/zip'

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
})