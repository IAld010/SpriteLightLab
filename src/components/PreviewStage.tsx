import { useEffect, useRef, useState } from 'react'
import { LightOverlay } from './LightOverlay'
import type { PreviewBackground, PreviewTextureMode } from '../domain/types'
import { PreviewRenderer } from '../renderer/PreviewRenderer'
import { getCurrentFrame, useEditorStore } from '../store/editorStore'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'

const EMPTY_PALETTE_SOURCES: string[] = []

interface PreviewStageProps {
  onStatusChange: (status: string) => void
}

export function PreviewStage({ onStatusChange }: PreviewStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PreviewRenderer | undefined>(undefined)
  const pointerState = useRef<
    { id: number; x: number; y: number; panX: number; panY: number } | undefined
  >(undefined)
  const renderOptions = useRef({
    textureMode: 'color' as PreviewTextureMode,
    background: 'checker' as PreviewBackground,
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const [error, setError] = useState<string>()
  const [readyVersion, setReadyVersion] = useState(0)

  const bundle = useEditorStore((state) => state.bundle)
  const backend = useEditorStore((state) => state.settings.backend)
  const textureMode = useEditorStore((state) => state.settings.textureMode)
  const background = useEditorStore((state) => state.settings.background)
  const zoom = useEditorStore((state) => state.settings.zoom)
  const panX = useEditorStore((state) => state.settings.panX)
  const panY = useEditorStore((state) => state.settings.panY)
  const setPan = useEditorStore((state) => state.setPan)
  const resetView = useEditorStore((state) => state.resetView)
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const paletteMode = bundle?.paletteMode ?? 'fullcolor'
  const paletteSources = bundle?.paletteSources ?? EMPTY_PALETTE_SOURCES
  const palette = useProjectStore((state) => activePaletteFromState(state))
  const lighting = useProjectStore((state) => state.lighting)
  const preferences = useProjectStore((state) => state.renderPreferences)

  useEffect(() => {
    renderOptions.current = { textureMode, background, zoom, panX, panY }
  }, [background, panX, panY, textureMode, zoom])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !bundle) {
      return
    }

    let disposed = false
    setError(undefined)
    onStatusChange('\u6b63\u5728\u521d\u59cb\u5316\u2026')
    const options = renderOptions.current

    void PreviewRenderer.create(host, bundle, backend, options)
      .then((renderer) => {
        if (disposed) {
          renderer.destroy()
          return
        }
        rendererRef.current = renderer
        onStatusChange(renderer.getBackendLabel())
        const frame = getCurrentFrame(useEditorStore.getState())
        return renderer.setFrame(frame, options.textureMode)
      })
      .catch((reason: unknown) => {
        if (disposed) {
          return
        }
        const message =
          reason instanceof Error ? reason.message : '\u9884\u89c8\u6e32\u67d3\u5668\u521d\u59cb\u5316\u5931\u8d25\u3002'
        setError(message)
        onStatusChange('\u521d\u59cb\u5316\u5931\u8d25')
      })
      .then(() => {
        if (!disposed) {
          setReadyVersion((value) => value + 1)
        }
      })

    return () => {
      disposed = true
      rendererRef.current?.destroy()
      rendererRef.current = undefined
      onStatusChange('\u672a\u8fde\u63a5')
    }
  }, [backend, bundle, onStatusChange])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }
    void renderer.setFrame(currentFrame, textureMode).catch((reason: unknown) =>
      setError(
        reason instanceof Error ? reason.message : '\u5f53\u524d\u5e27\u52a0\u8f7d\u5931\u8d25\u3002',
      ),
    )
  }, [currentFrame, readyVersion, textureMode])

  useEffect(() => {
    if (rendererRef.current && palette) {
      rendererRef.current.updateAppearance({
        paletteMode,
        paletteSources,
        palette,
        lighting,
        preferences,
      })
    }
  }, [palette, paletteMode, paletteSources, lighting, preferences, readyVersion])

  useEffect(() => {
    rendererRef.current?.setZoom(zoom)
  }, [zoom])

  useEffect(() => {
    rendererRef.current?.setPan(panX, panY)
  }, [panX, panY])

  useEffect(() => {
    rendererRef.current?.setBackground(background)
  }, [background, readyVersion])

  return (
    <div className="preview-shell">
      <div
        ref={hostRef}
        className="preview-canvas-host"
        data-background={background}
        aria-label={'\u5b9e\u65f6\u9884\u89c8'}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest('.light-handle')) {
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerState.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX,
            panY,
          }
        }}
        onPointerMove={(event) => {
          const state = pointerState.current
          if (!state || state.id !== event.pointerId) {
            return
          }
          const bounds = event.currentTarget.getBoundingClientRect()
          setPan(
            state.panX + ((event.clientX - state.x) / bounds.width) * 2,
            state.panY + ((event.clientY - state.y) / bounds.height) * 2,
          )
        }}
        onPointerUp={(event) => {
          if (pointerState.current?.id === event.pointerId) {
            pointerState.current = undefined
          }
        }}
        onDoubleClick={resetView}
      />
      {!bundle && (
        <div className="preview-placeholder">
          <div className="placeholder-mark">SL</div>
          <h2>{'\u628a\u7cbe\u7075\u56fe\u548c\u6cd5\u7ebf\u56fe\u653e\u5230\u8fd9\u91cc'}</h2>
          <p>
            {'\u652f\u6301\u9010\u5e27 PNG\u3001_n / _normal \u6cd5\u7ebf\u56fe\uff0c\u4ee5\u53ca Aseprite / TexturePacker JSON\u3002'}
          </p>
        </div>
      )}
      {error && (
        <div className="renderer-error" role="alert">
          <strong>{'\u65e0\u6cd5\u4f7f\u7528\u5f53\u524d\u6e32\u67d3\u540e\u7aef'}</strong>
          <span>{error}</span>
          <small>
            {'\u53ef\u5207\u6362\u5230 WebGL2 \u540e\u7ee7\u7eed\uff1bWebGPU \u7684\u5b8c\u6574\u5149\u7167\u4f1a\u5728\u9636\u6bb5 3 \u9a8c\u6536\u3002'}
          </small>
        </div>
      )}
      <LightOverlay />
      <div className="canvas-corner-label">
        {textureMode === 'normal'
          ? '\u6cd5\u7ebf\u56fe\u9884\u89c8'
          : '\u989c\u8272\u56fe\u9884\u89c8'}{' '}
        · {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}