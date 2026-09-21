import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyManualMatching,
  createMatchingWorkspace,
  type MatchingRow,
} from '../domain/manualMatching'
import type { AssetBundle, PreviewFrame, RuntimeImage, TextureRef } from '../domain/types'
import { ImportRulesPanel } from './ImportRulesPanel'

interface ManualMatchPageProps {
  bundle: AssetBundle
  onCancel: () => void
  onConfirm: (bundle: AssetBundle) => void
}

type MatchKind = 'source' | 'normal'

interface DragPayload {
  kind: MatchKind
  id: string
}

function useObjectUrl(file: File): string {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(
    () => () => {
      URL.revokeObjectURL(url)
    },
    [url],
  )
  return url
}

function Thumbnail({
  file,
  image,
  rect,
  kind,
}: {
  file: File
  image: RuntimeImage
  rect?: TextureRef['rect']
  kind: MatchKind
}) {
  const url = useObjectUrl(file)
  const width = rect ? (image.width / rect.width) * 100 : 100
  const height = rect ? (image.height / rect.height) * 100 : 100
  const translateX = rect ? -(rect.x / rect.width) * 100 : 0
  const translateY = rect ? -(rect.y / rect.height) * 100 : 0

  return (
    <span className={`match-thumbnail match-thumbnail-${kind}`}>
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          width: `${width}%`,
          height: `${height}%`,
          transform: `translate(${translateX}%, ${translateY}%)`,
        }}
      />
    </span>
  )
}

function frameImage(bundle: AssetBundle, frame: PreviewFrame): RuntimeImage | undefined {
  return bundle.images.find((image) => image.id === frame.source.imageId)
}

function candidateImage(bundle: AssetBundle, candidate: TextureRef): RuntimeImage | undefined {
  return bundle.images.find((image) => image.id === candidate.imageId)
}

function newRowId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`
  return `matching-row:${random}`
}

export function ManualMatchPage({ bundle, onCancel, onConfirm }: ManualMatchPageProps) {
  const initial = createMatchingWorkspace(bundle)
  const [rows, setRows] = useState<MatchingRow[]>(initial.rows)
  const [selected, setSelected] = useState<DragPayload>()
  const dragging = useRef<DragPayload | undefined>(undefined)

  const frameById = useMemo(() => new Map(bundle.frames.map((frame) => [frame.id, frame])), [bundle])
  const candidateById = useMemo(
    () => new Map(bundle.normalCandidates.map((candidate) => [candidate.id, candidate])),
    [bundle],
  )
  const assignedSourceIds = new Set(rows.flatMap((row) => (row.sourceFrameId ? [row.sourceFrameId] : [])))
  const assignedNormalIds = new Set(
    rows.flatMap((row) => (row.normalCandidateId ? [row.normalCandidateId] : [])),
  )
  const unpairedFrames = bundle.frames.filter((frame) => !assignedSourceIds.has(frame.id))
  const unpairedNormals = bundle.normalCandidates.filter(
    (candidate) => !assignedNormalIds.has(candidate.id),
  )
  const draftBundle = useMemo(() => applyManualMatching(bundle, rows), [bundle, rows])
  const errors = draftBundle.warnings.filter((warning) => warning.severity === 'error')
  const matchedRows = rows.filter((row) => row.sourceFrameId)
  const addRow = () => {
    setRows((current) => [...current, { id: newRowId() }])
  }

  const assignItem = (toRowId: string, payload: DragPayload) => {
    const field = payload.kind === 'source' ? 'sourceFrameId' : 'normalCandidateId'
    setRows((current) => {
      const next = current.map((row) => ({ ...row }))
      const target = next.find((row) => row.id === toRowId)
      if (!target) {
        return current
      }
      const sourceRow = next.find((row) => row[field] === payload.id)
      const replaced = target[field]
      target[field] = payload.id
      if (sourceRow && sourceRow !== target) {
        sourceRow[field] = replaced
      }
      return next
    })
    setSelected(undefined)
  }

  const clearSlot = (rowId: string, kind: MatchKind) => {
    const field = kind === 'source' ? 'sourceFrameId' : 'normalCandidateId'
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: undefined } : row)),
    )
  }

  const removeRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId))
  }

  const dragStart = (event: React.DragEvent, payload: DragPayload) => {
    dragging.current = payload
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-sprite-light-match', JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
  }

  const dropOnSlot = (event: React.DragEvent, rowId: string, kind: MatchKind) => {
    event.preventDefault()
    let payload = dragging.current
    const raw = event.dataTransfer.getData('application/x-sprite-light-match') || event.dataTransfer.getData('text/plain')
    if (raw) {
      try {
        payload = JSON.parse(raw) as DragPayload
      } catch {
        payload = dragging.current
      }
    }
    if (payload?.kind === kind) {
      assignItem(rowId, payload)
    }
    dragging.current = undefined
  }

  const activateSlot = (rowId: string, kind: MatchKind) => {
    if (selected?.kind === kind) {
      assignItem(rowId, selected)
    }
  }

  const confirm = () => {
    if (errors.length === 0 && draftBundle.frames.length > 0) {
      onConfirm(draftBundle)
    }
  }

  const renderPoolItem = (kind: MatchKind, id: string, name: string, thumbnail: React.ReactNode) => (
    <div
      role="button"
      tabIndex={0}
      className={`matching-pool-item ${selected?.kind === kind && selected.id === id ? 'is-selected' : ''}`}
      draggable
      data-match-kind={kind}
      data-match-id={id}
      onDragStart={(event) => dragStart(event, { kind, id })}
      onDragEnd={() => { dragging.current = undefined }}
      onClick={() => setSelected({ kind, id })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setSelected({ kind, id })
        }
      }}
    >
      {thumbnail}
      <span>{name}</span>
    </div>
  )

  return (
    <main className="manual-match-page" data-testid="manual-match-page">
      <header className="manual-match-header">
        <div>
          <div className="eyebrow">导入步骤 2 / 2</div>
          <h1>手动确认精灵与法线配对</h1>
          <p>自动匹配成功的项目已经预填；失败的项目可以从左侧拖拽到下方平行匹配行。</p>
        </div>
        <div className="manual-match-header-actions">
          <button type="button" className="button" onClick={onCancel}>取消导入</button>
          <button
            type="button"
            className="button button-primary"
            disabled={draftBundle.frames.length === 0 || errors.length > 0}
            onClick={confirm}
            data-testid="confirm-manual-match"
          >
            确认 {draftBundle.frames.length} 帧并进入编辑器
          </button>
        </div>
      </header>

      <div className="manual-match-summary">
        <span>自动匹配 <strong>{initial.rows.length}</strong></span>
        <span>当前配对行 <strong>{matchedRows.length}</strong></span>
        <span>待匹配精灵 <strong>{unpairedFrames.length}</strong></span>
        <span>待匹配法线 <strong>{unpairedNormals.length}</strong></span>
        <span className={errors.length > 0 ? 'has-error' : ''}>错误 <strong>{errors.length}</strong></span>
      </div>

      <div className="manual-match-layout">
        <aside className="matching-image-pool">
          <section>
            <div className="section-title-row">
              <strong>精灵图池</strong>
              <span>{unpairedFrames.length}</span>
            </div>
            <div className="matching-pool-list">
              {unpairedFrames.length === 0 ? (
                <div className="empty-inline">所有精灵图都已放入匹配行。</div>
              ) : (
                unpairedFrames.map((frame) => {
                  const image = frameImage(bundle, frame)
                  return image
                    ? renderPoolItem(
                        'source',
                        frame.id,
                        frame.name,
                        <Thumbnail file={image.file} image={image} rect={frame.source.rect} kind="source" />,
                      )
                    : null
                })
              )}
            </div>
          </section>

          <section>
            <div className="section-title-row">
              <strong>法线图池</strong>
              <span>{unpairedNormals.length}</span>
            </div>
            <div className="matching-pool-list">
              {unpairedNormals.length === 0 ? (
                <div className="empty-inline">所有法线图都已放入匹配行。</div>
              ) : (
                unpairedNormals.map((candidate) => {
                  const image = candidateImage(bundle, candidate)
                  return image
                    ? renderPoolItem(
                        'normal',
                        candidate.id,
                        candidate.name,
                        <Thumbnail file={image.file} image={image} rect={candidate.rect} kind="normal" />,
                      )
                    : null
                })
              )}
            </div>
          </section>
        </aside>

        <section className="matching-workspace">
          <div className="matching-workspace-heading">
            <div>
              <strong>配对行</strong>
              <span>每一行的上方放精灵图，下方放对应法线图。</span>
            </div>
            <button type="button" className="button" onClick={addRow}>添加空白匹配行</button>
          </div>

          <div className="matching-rows">
            {rows.length === 0 && (
              <div className="matching-empty-state" onDragOver={(event) => event.preventDefault()}>
                <strong>还没有匹配行</strong>
                <span>点击“添加空白匹配行”，再把左侧图片拖入。</span>
                <button type="button" className="button button-primary" onClick={addRow}>添加第一行</button>
              </div>
            )}

            {rows.map((row, index) => {
              const frame = row.sourceFrameId ? frameById.get(row.sourceFrameId) : undefined
              const candidate = row.normalCandidateId
                ? candidateById.get(row.normalCandidateId)
                : undefined
              const colorImage = frame ? frameImage(bundle, frame) : undefined
              const normalImage = candidate ? candidateImage(bundle, candidate) : undefined
              return (
                <article className="matching-row" key={row.id} data-row-id={row.id}>
                  <div className="matching-row-number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="matching-row-pairs">
                    <div
                      className={`matching-slot matching-slot-source ${frame ? 'is-filled' : ''}`}
                      data-drop-kind="source"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropOnSlot(event, row.id, 'source')}
                      onClick={() => activateSlot(row.id, 'source')}
                    >
                      {frame && colorImage ? (
                        <>
                          <div
                            draggable
                            onDragStart={(event) => dragStart(event, { kind: 'source', id: frame.id })}
                            onDragEnd={() => { dragging.current = undefined }}
                          >
                            <Thumbnail file={colorImage.file} image={colorImage} rect={frame.source.rect} kind="source" />
                          </div>
                          <div className="matching-slot-label">
                            <strong>{frame.name}</strong>
                            <span>{colorImage.width}×{colorImage.height}</span>
                          </div>
                          <button
                            type="button"
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation()
                              clearSlot(row.id, 'source')
                            }}
                          >
                            清除
                          </button>
                        </>
                      ) : (
                        <span className="matching-slot-placeholder">拖入精灵图</span>
                      )}
                    </div>
                    <div className="matching-row-link" aria-hidden="true">↕</div>
                    <div
                      className={`matching-slot matching-slot-normal ${candidate ? 'is-filled' : ''}`}
                      data-drop-kind="normal"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropOnSlot(event, row.id, 'normal')}
                      onClick={() => activateSlot(row.id, 'normal')}
                    >
                      {candidate && normalImage ? (
                        <>
                          <div
                            draggable
                            onDragStart={(event) => dragStart(event, { kind: 'normal', id: candidate.id })}
                            onDragEnd={() => { dragging.current = undefined }}
                          >
                            <Thumbnail file={normalImage.file} image={normalImage} rect={candidate.rect} kind="normal" />
                          </div>
                          <div className="matching-slot-label">
                            <strong>{candidate.name}</strong>
                            <span>{normalImage.width}×{normalImage.height}</span>
                          </div>
                          <button
                            type="button"
                            className="mini-button"
                            onClick={(event) => {
                              event.stopPropagation()
                              clearSlot(row.id, 'normal')
                            }}
                          >
                            清除
                          </button>
                        </>
                      ) : (
                        <span className="matching-slot-placeholder">拖入对应法线图</span>
                      )}
                    </div>
                  </div>
                  <div className="matching-row-state">
                    <span className={`pair-dot pair-${frame && candidate ? 'manual' : 'missing'}`} />
                    <small>{frame && candidate ? '已配对' : '缺少法线'}</small>
                    <button type="button" className="mini-button danger" onClick={() => removeRow(row.id)}>
                      移除行
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {errors.length > 0 && (
            <div className="matching-errors" role="alert">
              {errors.map((warning, index) => (
                <div className="warning-card warning-error" key={`${warning.code}:${index}`}>
                  <strong>阻止导入</strong>
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <ImportRulesPanel />
      </div>
    </main>
  )
}
