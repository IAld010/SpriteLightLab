export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '')
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

export function stripExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(0, index) : name
}

export function baseFileName(path: string): string {
  const normalized = normalizePath(path)
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'item'
}

export function uniqueId(prefix: string, value: string): string {
  return `${prefix}:${value}`
}