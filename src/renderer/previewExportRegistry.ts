export interface PreviewExporter {
  exportViewportPng: () => Promise<Blob>
  exportFramePng: () => Promise<Blob>
}

let activeExporter: PreviewExporter | undefined

export function registerPreviewExporter(exporter: PreviewExporter): void {
  activeExporter = exporter
}

export function unregisterPreviewExporter(exporter: PreviewExporter): void {
  if (activeExporter === exporter) {
    activeExporter = undefined
  }
}

export function getPreviewExporter(): PreviewExporter | undefined {
  return activeExporter
}