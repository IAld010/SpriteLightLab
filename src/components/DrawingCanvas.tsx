import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DrawingToolRail } from './DrawingToolRail'
import {
  drawEllipsePixels,
  drawLinePixels,
  drawRectanglePixels,
  floodFillPixels,
  hexToRgba,
  resizePixel,
  type PixelPoint,
} from '../domain/pixelToolkit'
import { renderSourceFrameCanvas } from '../renderer/RefinementRenderer'
import { activePaletteFromState, useProjectStore } from '../store/projectStore'
import { getCurrentFrame, getSelectedAction, useEditorStore } from '../store/editorStore'
import { useRefinementStore, type DrawingTool } from '../store/refinementStore'
import { useI18n } from '../i18n'

interface SelectionRect { x: number; y: number; width: number; height: number }
interface PointerState {
  id: number
  tool: DrawingTool
  start: PixelPoint
  last: PixelPoint
  snapshot?: ImageData
  imageData?: ImageData
  selectionPixels?: ImageData
  moved: boolean
}

function normalizeRect(start: PixelPoint, end: PixelPoint): SelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  }
}

function clampPoint(point: PixelPoint, width: number, height: number): PixelPoint {
  return {
    x: Math.max(0, Math.min(width - 1, Math.floor(point.x))),
    y: Math.max(0, Math.min(height - 1, Math.floor(point.y))),
  }
}

async function loadCanvasFromBlob(blob: Blob | undefined, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (!blob) return canvas
  const bitmap = await createImageBitmap(blob)
  try {
    const context = canvas.getContext('2d')
    if (!context) return canvas
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, 0, 0)
    return canvas
  } finally {
    bitmap.close()
  }
}

function tintedCanvas(source: HTMLCanvasElement, color: string, alpha: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.drawImage(source, 0, 0)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalAlpha = alpha
  return canvas
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法导出细化 Cel。')), 'image/png')
  })
}

export function DrawingCanvas() {
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const layerCanvasRef = useRef<HTMLCanvasElement>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | undefined>(undefined)
  const onionCanvasesRef = useRef<Array<{ opacity: number; canvas: HTMLCanvasElement }>>([])
  const celCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const pointerRef = useRef<PointerState | undefined>(undefined)
  const spacePressedRef = useRef(false)
  const [viewScale, setViewScale] = useState(8)
  const [selection, setSelection] = useState<SelectionRect>()
  const [cursor, setCursor] = useState<PixelPoint>()
  const [drawVersion, setDrawVersion] = useState(0)
  const [message, setMessage] = useState<string>()

  const bundle = useEditorStore((state) => state.bundle)
  const frame = useEditorStore((state) => getCurrentFrame(state))
  const action = useEditorStore((state) => getSelectedAction(state))
  const palette = useProjectStore((state) => activePaletteFromState(state))
  const refinement = useRefinementStore((state) => frame ? state.refinements[frame.id] : undefined)
  const assets = useRefinementStore((state) => state.assets)
  const selectedLayerId = useRefinementStore((state) => state.selectedLayerId)
  const tool = useRefinementStore((state) => state.tool)
  const primaryColor = useRefinementStore((state) => state.primaryColor)
  const brushSize = useRefinementStore((state) => state.brushSize)
  const pixelGrid = useRefinementStore((state) => state.pixelGrid)
  const onionSkinSetting = useRefinementStore((state) => state.onionSkin)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const setTool = useRefinementStore((state) => state.setTool)
  const selectLayer = useRefinementStore((state) => state.selectLayer)
  const ensureFrame = useRefinementStore((state) => state.ensureFrame)
  const saveCelBlob = useRefinementStore((state) => state.saveCelBlob)

  const sourceImage = frame ? bundle?.images.find((image) => image.id === frame.source.imageId) : undefined
  const frameWidth = frame?.source.rect?.width ?? sourceImage?.width ?? 1
  const frameHeight = frame?.source.rect?.height ?? sourceImage?.height ?? 1
  const activeLayerId = useMemo(() => {
    if (!refinement) return undefined
    return refinement.layers.some((layer) => layer.id === selectedLayerId) ? selectedLayerId : refinement.layers[0]?.id
  }, [refinement, selectedLayerId])
  const activeLayer = refinement?.layers.find((layer) => layer.id === activeLayerId)
  const onionSkin = useMemo(
    () => isPlaying ? { ...onionSkinSetting, enabled: false } : onionSkinSetting,
    [isPlaying, onionSkinSetting],
  )

  const renderDisplay = useCallback(() => {
    const canvas = displayCanvasRef.current
    const layerCanvas = layerCanvasRef.current
    if (!canvas || !layerCanvas || canvas.width < 1 || canvas.height < 1) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const onion of onionCanvasesRef.current) {
      context.save()
      context.globalAlpha = onion.opacity
      context.drawImage(onion.canvas, 0, 0)
      context.restore()
    }
    if (baseCanvasRef.current && refinement?.sourceVisible !== false) {
      context.save()
      context.globalAlpha = refinement?.sourceOpacity ?? 1
      context.drawImage(baseCanvasRef.current, 0, 0)
      context.restore()
    }
    if (refinement) {
      for (const layer of refinement.layers) {
        if (!layer.visible) continue
        if (layer.id === activeLayerId) {
          context.save()
          context.globalAlpha = layer.opacity
          context.globalCompositeOperation = layer.blendMode === 'add' ? 'lighter' : layer.blendMode === 'normal' ? 'source-over' : layer.blendMode
          context.imageSmoothingEnabled = false
          context.drawImage(layerCanvas, 0, 0)
          context.restore()
          continue
        }
        const cel = refinement.cels.find((candidate) => candidate.layerId === layer.id)
        const cached = cel?.bitmapAssetId ? celCanvasCacheRef.current.get(cel.bitmapAssetId) : undefined
        if (!cached) continue
        context.save()
        context.globalAlpha = layer.opacity
        context.globalCompositeOperation = layer.blendMode === 'add' ? 'lighter' : layer.blendMode === 'normal' ? 'source-over' : layer.blendMode
        context.imageSmoothingEnabled = false
        context.drawImage(cached, cel?.offsetX ?? 0, cel?.offsetY ?? 0)
        context.restore()
      }
    }
    if (pixelGrid && viewScale >= 4) {
      context.save()
      context.strokeStyle = 'rgba(255,255,255,0.22)'
      context.lineWidth = 1 / viewScale
      for (let x = 1; x < canvas.width; x += 1) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, canvas.height)
        context.stroke()
      }
      for (let y = 1; y < canvas.height; y += 1) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(canvas.width, y)
        context.stroke()
      }
      context.restore()
    }
    if (selection) {
      context.save()
      context.strokeStyle = '#ffffff'
      context.lineWidth = 1 / viewScale
      context.setLineDash([4 / viewScale, 3 / viewScale])
      context.strokeRect(selection.x, selection.y, Math.max(0, selection.width - 1), Math.max(0, selection.height - 1))
      context.restore()
    }
    if (cursor && (tool === 'pencil' || tool === 'eraser')) {
      context.save()
      context.globalCompositeOperation = 'difference'
      context.fillStyle = 'rgba(255, 255, 255, 0.72)'
      for (const pixel of resizePixel(cursor, brushSize)) {
        context.fillRect(pixel.x, pixel.y, 1, 1)
      }
      context.restore()
    }
  }, [activeLayerId, brushSize, cursor, pixelGrid, refinement, selection, tool, viewScale])

  useEffect(() => {
    if (!bundle || !frame || !palette) return
    let cancelled = false
    void (async () => {
      try {
        const base = await renderSourceFrameCanvas({ bundle, frame, paletteMode: bundle.paletteMode, paletteSources: bundle.paletteSources, palette })
        const frameIndex = action?.frameIds.indexOf(frame.id) ?? -1
        const frames = action?.frameIds.flatMap((frameId) => {
          const candidate = bundle.frames.find((item) => item.id === frameId)
          return candidate ? [candidate] : []
        }) ?? []
        const onionEntries: typeof onionCanvasesRef.current = []
        if (onionSkin.enabled && frameIndex >= 0) {
          for (let offset = -onionSkin.before; offset <= onionSkin.after; offset += 1) {
            if (offset === 0) continue
            const sourceFrame = frames[frameIndex + offset]
            if (!sourceFrame) continue
            const rendered = await renderSourceFrameCanvas({ bundle, frame: sourceFrame, paletteMode: bundle.paletteMode, paletteSources: bundle.paletteSources, palette })
            onionEntries.push({ opacity: onionSkin.opacity, canvas: tintedCanvas(rendered, offset < 0 ? onionSkin.beforeColor : onionSkin.afterColor, onionSkin.opacity) })
          }
        }
        if (cancelled) return
        baseCanvasRef.current = base
        onionCanvasesRef.current = onionEntries
        setDrawVersion((value) => value + 1)
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '画布加载失败。')
      }
    })()
    return () => { cancelled = true }
  }, [action, bundle, frame, onionSkin, palette])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cache = new Map<string, HTMLCanvasElement>()
      for (const asset of Object.values(assets)) {
        try { cache.set(asset.id, await loadCanvasFromBlob(asset.blob, asset.width, asset.height)) } catch { /* keep empty */ }
      }
      if (!cancelled) {
        celCanvasCacheRef.current = cache
        setDrawVersion((value) => value + 1)
      }
    })()
    return () => { cancelled = true }
  }, [assets])

  useEffect(() => {
    let cancelled = false
    const cel = refinement?.cels.find((candidate) => candidate.layerId === activeLayerId)
    const asset = cel?.bitmapAssetId ? assets[cel.bitmapAssetId] : undefined
    void loadCanvasFromBlob(asset?.blob, frameWidth, frameHeight).then((canvas) => {
      if (!cancelled) {
        layerCanvasRef.current = canvas
        setDrawVersion((value) => value + 1)
      }
    })
    return () => { cancelled = true }
  }, [activeLayerId, assets, frameHeight, frameWidth, refinement])

  useEffect(() => { renderDisplay() }, [drawVersion, renderDisplay])

  useEffect(() => {
    if (!viewportRef.current || frameWidth < 1 || frameHeight < 1) return
    const bounds = viewportRef.current.getBoundingClientRect()
    const fit = Math.floor(Math.min((bounds.width - 80) / frameWidth, (bounds.height - 80) / frameHeight))
    setViewScale(Math.max(1, Math.min(16, fit || 1)))
  }, [frameHeight, frameWidth])

  const pixelFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>): PixelPoint => {
    const canvas = displayCanvasRef.current!
    const bounds = canvas.getBoundingClientRect()
    return clampPoint({ x: ((event.clientX - bounds.left) / bounds.width) * canvas.width, y: ((event.clientY - bounds.top) / bounds.height) * canvas.height }, canvas.width, canvas.height)
  }, [])

  const prepareLayer = useCallback((): { layerId: string; width: number; height: number } | undefined => {
    if (!frame) return undefined
    const current = refinement ?? ensureFrame(frame.id, frameWidth, frameHeight)
    const layer = current.layers.find((candidate) => candidate.id === activeLayerId) ?? current.layers[0]
    if (!layer) return undefined
    if (layer.locked || !layer.visible) {
      setMessage(layer.locked ? '当前图层已锁定。' : '当前图层已隐藏。')
      return undefined
    }
    selectLayer(layer.id)
    return { layerId: layer.id, width: frameWidth, height: frameHeight }
  }, [activeLayerId, ensureFrame, frame, frameHeight, frameWidth, refinement, selectLayer])

  const commitLayer = useCallback(async (layerId: string, width: number, height: number) => {
    if (!frame || !layerCanvasRef.current) return
    saveCelBlob(frame.id, layerId, await canvasToBlob(layerCanvasRef.current), width, height)
  }, [frame, saveCelBlob])

  const beginPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const point = pixelFromEvent(event)
    setCursor(point)
    const activeTool = spacePressedRef.current ? 'hand' : tool
    if (activeTool === 'hand') {
      event.currentTarget.setPointerCapture(event.pointerId)
      pointerRef.current = { id: event.pointerId, tool: 'hand', start: point, last: point, moved: false }
      return
    }
    if (activeTool === 'eyedropper') {
      const context = displayCanvasRef.current?.getContext('2d', { willReadFrequently: true })
      const sample = context?.getImageData(point.x, point.y, 1, 1).data
      if (sample) useRefinementStore.getState().setPrimaryColor(`#${[sample[0], sample[1], sample[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`)
      return
    }
    const prepared = prepareLayer()
    if (!prepared || !layerCanvasRef.current) return
    const context = layerCanvasRef.current.getContext('2d', { willReadFrequently: true })
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer: PointerState = { id: event.pointerId, tool: activeTool, start: point, last: point, moved: false }
    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const imageData = context.getImageData(0, 0, layerCanvasRef.current.width, layerCanvasRef.current.height)
      drawLinePixels(
        imageData,
        point,
        point,
        brushSize,
        activeTool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : hexToRgba(primaryColor),
      )
      context.putImageData(imageData, 0, 0)
      pointer.imageData = imageData
      setDrawVersion((value) => value + 1)
    } else if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'ellipse') {
      pointer.snapshot = context.getImageData(0, 0, layerCanvasRef.current.width, layerCanvasRef.current.height)
    } else if (activeTool === 'select') {
      setSelection(normalizeRect(point, point))
    } else if (activeTool === 'move' && selection) {
      pointer.snapshot = context.getImageData(0, 0, layerCanvasRef.current.width, layerCanvasRef.current.height)
      pointer.selectionPixels = context.getImageData(selection.x, selection.y, selection.width, selection.height)
    } else if (activeTool === 'bucket') {
      const imageData = context.getImageData(0, 0, layerCanvasRef.current.width, layerCanvasRef.current.height)
      if (floodFillPixels(imageData, point, hexToRgba(primaryColor))) {
        context.putImageData(imageData, 0, 0)
        setDrawVersion((value) => value + 1)
        void commitLayer(prepared.layerId, prepared.width, prepared.height)
      }
      return
    }
    pointerRef.current = pointer
  }

  const movePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pixelFromEvent(event)
    setCursor(point)
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    pointer.moved = pointer.moved || pointer.last.x !== point.x || pointer.last.y !== point.y
    if (pointer.tool === 'hand') { pointer.last = point; return }
    const prepared = prepareLayer()
    const layerCanvas = layerCanvasRef.current
    const context = layerCanvas?.getContext('2d', { willReadFrequently: true })
    if (!prepared || !layerCanvas || !context) return
    if (pointer.tool === 'pencil' || pointer.tool === 'eraser') {
      if (!pointer.imageData) return
      drawLinePixels(
        pointer.imageData,
        pointer.last,
        point,
        brushSize,
        pointer.tool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : hexToRgba(primaryColor),
      )
      context.putImageData(pointer.imageData, 0, 0)
      setDrawVersion((value) => value + 1)
    } else if (pointer.tool === 'line' || pointer.tool === 'rectangle' || pointer.tool === 'ellipse') {
      if (!pointer.snapshot) return
      const imageData = new ImageData(
        new Uint8ClampedArray(pointer.snapshot.data),
        pointer.snapshot.width,
        pointer.snapshot.height,
      )
      const color = hexToRgba(primaryColor)
      if (pointer.tool === 'line') {
        drawLinePixels(imageData, pointer.start, point, brushSize, color)
      } else if (pointer.tool === 'rectangle') {
        drawRectanglePixels(imageData, pointer.start, point, brushSize, color)
      } else {
        drawEllipsePixels(imageData, pointer.start, point, brushSize, color)
      }
      context.putImageData(imageData, 0, 0)
      setDrawVersion((value) => value + 1)
    } else if (pointer.tool === 'select') {
      setSelection(normalizeRect(pointer.start, point))
    } else if (pointer.tool === 'move' && pointer.snapshot && pointer.selectionPixels) {
      context.putImageData(pointer.snapshot, 0, 0)
      context.clearRect(selection?.x ?? 0, selection?.y ?? 0, selection?.width ?? 0, selection?.height ?? 0)
      const offsetX = point.x - pointer.start.x
      const offsetY = point.y - pointer.start.y
      context.putImageData(pointer.selectionPixels, (selection?.x ?? 0) + offsetX, (selection?.y ?? 0) + offsetY)
      setSelection({ x: (selection?.x ?? 0) + offsetX, y: (selection?.y ?? 0) + offsetY, width: selection?.width ?? 1, height: selection?.height ?? 1 })
      setDrawVersion((value) => value + 1)
    }
    pointer.last = point
  }

  const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    pointerRef.current = undefined
    if (pointer.tool === 'hand' || pointer.tool === 'select' || pointer.tool === 'eyedropper') return
    const prepared = prepareLayer()
    if (prepared) void commitLayer(prepared.layerId, prepared.width, prepared.height)
  }

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.code === 'Space') { spacePressedRef.current = true; event.preventDefault(); return }
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === '=' || key === '+')) {
        event.preventDefault()
        setViewScale((value) => Math.min(32, value + 1))
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === '-') {
        event.preventDefault()
        setViewScale((value) => Math.max(1, value - 1))
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (key === 'b') setTool('pencil')
      else if (key === 'e') setTool('eraser')
      else if (key === 'g') setTool('bucket')
      else if (key === 'i') setTool('eyedropper')
      else if (key === 'l') setTool('line')
      else if (key === 'm') setTool('select')
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') { spacePressedRef.current = false; event.preventDefault() }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [setTool])

  if (!bundle || !frame) return <div className="drawing-empty">{t('请先打开一个精灵项目。')}</div>


  const fitView = () => {
    const bounds = viewportRef.current?.getBoundingClientRect()
    if (!bounds) return
    const fit = Math.floor(Math.min((bounds.width - 96) / frameWidth, (bounds.height - 96) / frameHeight))
    setViewScale(Math.max(1, Math.min(32, fit || 1)))
  }

  return (
    <section className="drawing-workspace-panel" aria-label={t('\u7ed8\u753b\u753b\u5e03')}>
      <DrawingToolRail />
      <div className="drawing-commandbar">
        <div className="drawing-command-context">
          <strong>{frame.name}</strong>
          <span>{action?.name ?? t('\u672a\u9009\u62e9\u52a8\u4f5c')}</span>
        </div>
        <div className="drawing-zoom-control" aria-label={t('\u7f29\u653e')}>
          <button type="button" onClick={() => setViewScale((value) => Math.max(1, value - 1))} aria-label={t('\u7f29\u5c0f')}>{'\u2212'}</button>
          <input
            data-testid="drawing-zoom-slider"
            type="range"
            min="1"
            max="32"
            step="1"
            value={viewScale}
            onChange={(event) => setViewScale(Number(event.target.value))}
          />
          <output data-testid="drawing-zoom-value">{viewScale * 100}%</output>
          <button type="button" onClick={() => setViewScale((value) => Math.min(32, value + 1))} aria-label={t('\u653e\u5927')}>+</button>
          <button type="button" className="fit-view-button" onClick={fitView}>{t('\u9002\u914d')}</button>
        </div>
      </div>
      <div ref={viewportRef} className="drawing-viewport">
        <div className="drawing-canvas-stack" style={{ width: frameWidth * viewScale, height: frameHeight * viewScale }}>
          <canvas
            ref={displayCanvasRef}
            width={frameWidth}
            height={frameHeight}
            className={`drawing-display-canvas ${tool === 'pencil' || tool === 'eraser' ? 'is-brush-cursor' : ''}`}
            onPointerDown={beginPointer}
            onPointerMove={movePointer}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={() => setCursor(undefined)}
          />
          <div
            className="drawing-grid-canvas"
            data-testid="drawing-grid"
            aria-hidden="true"
            style={{
              backgroundImage: pixelGrid
                ? 'linear-gradient(to right, rgba(230,238,255,0.34) 1px, transparent 1px), linear-gradient(to bottom, rgba(230,238,255,0.34) 1px, transparent 1px)'
                : 'none',
              backgroundSize: `${viewScale}px ${viewScale}px`,
            }}
          />
        </div>
      </div>
      <div className="drawing-statusbar">
        <span>{cursor ? `${cursor.x}, ${cursor.y}` : '\u2014'}</span>
        <span>{frameWidth} {'\u00d7'} {frameHeight}</span>
        <span>{activeLayer?.name ?? t('\u6ca1\u6709\u7ec6\u5316\u56fe\u5c42')}</span>
        <span>{message ?? t('\u7b14\u5237\u4e00\u7b14\u63d0\u4ea4\u4e00\u6b21\uff0c\u652f\u6301 Ctrl+Z \u64a4\u9500')}</span>
      </div>
    </section>
  )
}
