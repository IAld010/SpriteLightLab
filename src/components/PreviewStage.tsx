import { useEffect, useRef, useState } from 'react'
import { LightOverlay } from './LightOverlay'
import type { PreviewBackground, PreviewTextureMode } from '../domain/types'
import { PreviewRenderer } from '../renderer/PreviewRenderer'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { resolveFrameAlignment } from '../domain/alignment'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'
import { t } from '../i18n'

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
  const selectedAction = useEditorStore((state) => getSelectedAction(state))
  const paletteMode = bundle?.paletteMode ?? 'fullcolor'
  const paletteSources = bundle?.paletteSources ?? EMPTY_PALETTE_SOURCES
  const palette = useProjectStore((state) => activePaletteFromState(state))
  const lighting = useProjectStore((state) => state.lighting)
  const preferences = useProjectStore((state) => state.renderPreferences)

  const sourceImage = currentFrame
    ? bundle?.images.find((image) => image.id === currentFrame.source.imageId)
    : undefined
  const frameWidth = currentFrame?.source.rect?.width ?? sourceImage?.width ?? 1
  const frameHeight = currentFrame?.source.rect?.height ?? sourceImage?.height ?? 1
  const frameAlignment = currentFrame
    ? currentFrame.alignment ?? resolveFrameAlignment(frameWidth, frameHeight, 'bottom-center')
    : undefined
  const actionAlignment = selectedAction?.alignment

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
    onStatusChange('正在初始化…')
    const options = renderOptions.current

    void PreviewRenderer.create(host, bundle, backend, options)
      .then((renderer) => {
        if (disposed) {
          renderer.destroy()
          return
        }
        rendererRef.current = renderer
        onStatusChange(renderer.getBackendLabel())
        const currentState = useEditorStore.getState()
        const frame = getCurrentFrame(currentState)
        const currentAction = getSelectedAction(currentState)
        return renderer.setFrame(
          frame,
          options.textureMode,
          frame?.alignment ?? (frame ? resolveFrameAlignment(
              frame.source.rect?.width ?? bundle.images.find((image) => image.id === frame.source.imageId)?.width ?? 1,
              frame.source.rect?.height ?? bundle.images.find((image) => image.id === frame.source.imageId)?.height ?? 1,
              'bottom-center',
            ) : undefined),
          currentAction?.alignment,
        )
      })
      .catch((reason: unknown) => {
        if (disposed) {
          return
        }
        const message =
          reason instanceof Error ? reason.message : '预览渲染器初始化失败。'
        setError(message)
        onStatusChange('初始化失败')
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
      onStatusChange('未连接')
    }
  }, [backend, bundle, onStatusChange])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }
    void renderer.setFrame(currentFrame, textureMode, frameAlignment, actionAlignment).catch((reason: unknown) =>
      setError(
        reason instanceof Error ? reason.message : '当前帧加载失败。',
      ),
    )
  }, [actionAlignment, currentFrame, frameAlignment, readyVersion, textureMode])

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
        aria-label={t('实时预览')}
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
          <h2>{t('把精灵图和法线图放到这里')}</h2>
          <p>
            {t('支持逐帧 PNG、_n / _normal 法线图，以及 Aseprite / TexturePacker JSON。')}
          </p>
        </div>
      )}
      {error && (
        <div className="renderer-error" role="alert">
          <strong>{t('无法使用当前渲染后端')}</strong>
          <span>{t(error)}</span>
          <small>
            {t('可切换到 WebGL2 后继续；WebGPU 的完整光照会在后续阶段验收。')}
          </small>
        </div>
      )}
      <LightOverlay />
      <div className="canvas-corner-label">
        {textureMode === 'normal'
          ? t('法线图预览')
          : t('颜色图预览')}{' · '}{Math.round(zoom * 100)}%

      </div>
    </div>
  )
}
