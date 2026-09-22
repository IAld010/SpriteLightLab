import { useEffect, useState } from 'react'

interface ObjectUrlEntry {
  file: File
  url: string
  refs: number
  revokeTimer?: ReturnType<typeof setTimeout>
}

const entries = new WeakMap<File, ObjectUrlEntry>()
const activeEntries = new Set<ObjectUrlEntry>()

function revokeEntry(entry: ObjectUrlEntry): void {
  if (entry.revokeTimer !== undefined) {
    clearTimeout(entry.revokeTimer)
    entry.revokeTimer = undefined
  }
  URL.revokeObjectURL(entry.url)
  entries.delete(entry.file)
  activeEntries.delete(entry)
}

export function revokeAllObjectUrls(): void {
  for (const entry of [...activeEntries]) {
    revokeEntry(entry)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', revokeAllObjectUrls)
}

function acquireObjectUrl(file: File): string {
  const existing = entries.get(file)
  if (existing) {
    if (existing.revokeTimer !== undefined) {
      clearTimeout(existing.revokeTimer)
      existing.revokeTimer = undefined
    }
    existing.refs += 1
    return existing.url
  }

  const entry: ObjectUrlEntry = {
    file,
    url: URL.createObjectURL(file),
    refs: 1,
  }
  entries.set(file, entry)
  activeEntries.add(entry)
  return entry.url
}

function releaseObjectUrl(file: File): void {
  const entry = entries.get(file)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs > 0) return
  entry.revokeTimer = setTimeout(() => {
    const current = entries.get(file)
    if (current !== entry || current.refs > 0) return
    revokeEntry(current)
  }, 0)
}

export function useObjectUrl(file?: File): string | undefined {
  const [entry, setEntry] = useState<{ file: File; url: string }>()

  useEffect(() => {
    if (!file) return
    const url = acquireObjectUrl(file)
    let active = true
    queueMicrotask(() => {
      if (active) {
        setEntry({ file, url })
      }
    })
    return () => {
      active = false
      releaseObjectUrl(file)
    }
  }, [file])

  return entry && entry.file === file ? entry.url : undefined
}