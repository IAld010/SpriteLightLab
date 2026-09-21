import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { resolveFrameAlignment } from '../domain/alignment'
import type { PreviewFrame } from '../domain/types'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'

function frameDimensions(bundle: NonNullable<ReturnType<typeof useEditorStore.getState>['bundle']>, frame: PreviewFrame) {
  const image = bundle.images.find((candidate) => candidate.id === frame.source.imageId)
  return {
    width: frame.source.rect?.width ?? image?.width ?? 1,
    height: frame.source.rect?.height ?? image?.height ?? 1,
  }
}

function FrameBitmap({
  frame,
  zoom,
  opacity = 1,
  left = 0,
  top = 0,
}: {
  frame: PreviewFrame
  zoom: number
  opacity?: number
  left?: number
  top?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bundle = useEditorStore((state) => state.bundle)
  const source = frame.source
  const image = bundle?.images.find((candidate) => candidate.id === source.imageId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    let cancelled = false
    const rect = source.rect
    const sx = rect?.x ?? 0
    const sy = rect?.y ?? 0
    const width = rect?.width ?? image.width
    const height = rect?.height ?? image.height

    void createImageBitmap(image.file, sx, sy, width, height)
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close()
          return
        }
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context?.clearRect(0, 0, width, height)
        context?.drawImage(bitmap, 0, 0)
        bitmap.close()
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [image, source])

  const size = bundle ? frameDimensions(bundle, frame) : { width: 1, height: 1 }
  return (
    <canvas
      ref={canvasRef}
      className="anchor-frame-bitmap"
      style={{
        width: size.width * zoom,
        height: size.height * zoom,
        opacity,
        left: left * zoom,
        top: top * zoom,
      }}
    />
  )
}

function snapAnchor(value: number, maximum: number, mode: 'pixel-center' | 'pixel-boundary' | 'free') {
  const clamped = Math.max(0, Math.min(maximum, value))
  if (mode === 'pixel-center') return Math.min(maximum, Math.floor(clamped) + 0.5)
  if (mode === 'pixel-boundary') return Math.round(clamped)
  return clamped
}

export function AnchorCalibrationOverlay() {
  const bundle = useEditorStore((state) => state.bundle)
  const currentFrame = useEditorStore((state) => getCurrentFrame(state))
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentFrameIndex = useEditorStore((state) => state.currentFrameIndex)
  const zoom = useEditorStore((state) => state.anchorCalibrationZoom)
  const gridVisible = useEditorStore((state) => state.anchorGridVisible)
  const onionSkin = useEditorStore((state) => state.anchorOnionSkin)
  const snapMode = useEditorStore((state) => state.anchorSnapMode)
  const updateFrameAlignment = useEditorStore((state) => state.updateFrameAlignment)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const currentSize = useMemo(
    () => (bundle && currentFrame ? frameDimensions(bundle, currentFrame) : { width: 1, height: 1 }),
    [bundle, currentFrame],
  )
  const currentAlignment = currentFrame
    ? currentFrame.alignment ?? resolveFrameAlignment(currentSize.width, currentSize.height, 'bottom-center')
    : undefined
  const previousFrame = action && currentFrameIndex > 0
    ? bundle?.frames.find((frame) => frame.id === action.frameIds[currentFrameIndex - 1])
    : undefined
  const nextFrame = action && currentFrameIndex + 1 < action.frameIds.length
    ? bundle?.frames.find((frame) => frame.id === action.frameIds[currentFrameIndex + 1])
    : undefined

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const frame = requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2)
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
    })
    return () => cancelAnimationFrame(frame)
  }, [currentFrame?.id, currentSize.height, currentSize.width, zoom])

  if (!bundle || !currentFrame || !currentAlignment) {
    return null
  }

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current
    if (!surface) return
    const bounds = surface.getBoundingClientRect()
    const x = snapAnchor((event.clientX - bounds.left) / zoom - originX, currentSize.width, snapMode)
    const y = snapAnchor((event.clientY - bounds.top) / zoom - originY, currentSize.height, snapMode)
    updateFrameAlignment(currentFrame.id, { pivotX: x, pivotY: y })
  }

  const relativePlacement = (frame: PreviewFrame) => {
    const size = frameDimensions(bundle, frame)
    const alignment = frame.alignment ?? resolveFrameAlignment(size.width, size.height, 'bottom-center')
    return {
      left: currentAlignment.pivotX - alignment.pivotX + alignment.offsetX - currentAlignment.offsetX,
      top: currentAlignment.pivotY - alignment.pivotY + alignment.offsetY - currentAlignment.offsetY,
      width: size.width,
      height: size.height,
    }
  }

  const originX = 0
  const originY = 0
  const surfaceWidth = currentSize.width
  const surfaceHeight = currentSize.height

  return (
    <div className="anchor-calibration-overlay" data-testid="anchor-calibration-overlay">
      <div className="anchor-calibration-meta">
        <span>{currentFrame.name}</span>
        <strong>{currentSize.width} × {currentSize.height} px</strong>
        <span>X {currentAlignment.pivotX} / Y {currentAlignment.pivotY}</span>
        <span>{zoom}×</span>
      </div>
      <div ref={viewportRef} className="anchor-calibration-viewport">
        <div
          ref={surfaceRef}
          className="anchor-calibration-surface"
          data-testid="anchor-calibration-surface"
          style={{ width: surfaceWidth * zoom, height: surfaceHeight * zoom }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            updateFromPointer(event)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateFromPointer(event)
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
        >
          {gridVisible && zoom >= 8 && (
            <div
              className="anchor-pixel-grid"
              data-testid="anchor-pixel-grid"
              style={{
                left: originX * zoom,
                top: originY * zoom,
                width: currentSize.width * zoom,
                height: currentSize.height * zoom,
                backgroundSize: `${zoom}px ${zoom}px, ${zoom}px ${zoom}px, ${zoom * 8}px ${zoom * 8}px, ${zoom * 8}px ${zoom * 8}px`,
              }}
            />
          )}
          {onionSkin && previousFrame && (
            <FrameBitmap frame={previousFrame} zoom={zoom} opacity={0.28} left={originX + relativePlacement(previousFrame).left} top={originY + relativePlacement(previousFrame).top} />
          )}
          {onionSkin && nextFrame && (
            <FrameBitmap frame={nextFrame} zoom={zoom} opacity={0.28} left={originX + relativePlacement(nextFrame).left} top={originY + relativePlacement(nextFrame).top} />
          )}
          <FrameBitmap frame={currentFrame} zoom={zoom} left={originX} top={originY} />
          <span
            className="anchor-crosshair-x"
            style={{ top: (originY + currentAlignment.pivotY) * zoom }}
          />
          <span
            className="anchor-crosshair-y"
            data-testid="anchor-crosshair-y"
            style={{ left: (originX + currentAlignment.pivotX) * zoom }}
          />
          <span
            className="anchor-crosshair-point"
            data-testid="anchor-crosshair-point"
            style={{
              left: (originX + currentAlignment.pivotX) * zoom,
              top: (originY + currentAlignment.pivotY) * zoom,
            }}
          />
        </div>
      </div>
    </div>
  )
}
