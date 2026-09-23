import { useRef, useState } from 'react'
import type { AssetBundle, PreviewFrame } from '../domain/types'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { getSelectedAction, useEditorStore } from '../store/editorStore'
import { useRefinementStore } from '../store/refinementStore'
import { markInternalDrag } from '../utils/dragAndDrop'
import { useI18n } from '../i18n'

function FrameMiniThumbnail({ frame, bundle }: { frame: PreviewFrame; bundle: AssetBundle }) {
  const image = bundle.images.find((candidate) => candidate.id === frame.source.imageId)
  const url = useObjectUrl(image?.file)
  const rect = frame.source.rect ?? { x: 0, y: 0, width: image?.width ?? 1, height: image?.height ?? 1 }
  const scale = Math.min(42 / rect.width, 30 / rect.height)
  if (!url) return <span className="compact-thumb-empty">—</span>
  return (
    <span className="compact-thumb">
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          width: (image?.width ?? rect.width) * scale,
          height: (image?.height ?? rect.height) * scale,
          left: (42 - rect.width * scale) / 2 - rect.x * scale,
          top: (30 - rect.height * scale) / 2 - rect.y * scale,
        }}
      />
    </span>
  )
}

export function CompactFrameStrip() {
  const { t } = useI18n()
  const bundle = useEditorStore((state) => state.bundle)
  const action = useEditorStore((state) => getSelectedAction(state))
  const currentIndex = useEditorStore((state) => state.currentFrameIndex)
  const selectFrame = useEditorStore((state) => state.selectFrame)
  const reorderFrames = useEditorStore((state) => state.reorderFrames)
  const refinements = useRefinementStore((state) => state.refinements)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number>()
  const [dropIndex, setDropIndex] = useState<number>()

  if (!bundle || !action) return <div className="compact-frame-strip compact-empty">{t('没有可编辑的帧。')}</div>
  const frames = action.frameIds.flatMap((frameId) => {
    const frame = bundle.frames.find((candidate) => candidate.id === frameId)
    return frame ? [frame] : []
  })

  return (
    <section className="compact-frame-strip" aria-label={t('紧凑帧列')}>
      <div className="compact-frame-label">
        <strong>{t('帧')}</strong>
        <span>{frames.length}</span>
      </div>
      <div className="compact-frame-track">
        {frames.map((frame, index) => {
          const refinement = refinements[frame.id]
          const hasPixels = refinement?.cels.some((cel) => Boolean(cel.bitmapAssetId)) ?? false
          const state = !hasPixels ? '○' : refinement?.visible ? '●' : '◐'
          const active = index === currentIndex
          return (
            <button
              ref={active ? activeRef : undefined}
              key={frame.id}
              type="button"
              draggable
              aria-current={active ? 'true' : undefined}
              className={`compact-frame-cell ${active ? 'is-active' : ''} ${dropIndex === index && draggedIndex !== index ? 'is-drop-target' : ''}`}
              onClick={() => selectFrame(frame.id)}
              onDragStart={(event) => { markInternalDrag(event); setDraggedIndex(index) }}
              onDragOver={(event) => { event.preventDefault(); setDropIndex(index) }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedIndex !== undefined) reorderFrames(action.id, draggedIndex, index)
                setDraggedIndex(undefined)
                setDropIndex(undefined)
              }}
              onDragEnd={() => { setDraggedIndex(undefined); setDropIndex(undefined) }}
            >
              <span className="compact-frame-head">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span className={hasPixels ? 'is-refined' : ''}>{state}</span>
              </span>
              <FrameMiniThumbnail frame={frame} bundle={bundle} />
              <span className="compact-frame-name">{frame.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
