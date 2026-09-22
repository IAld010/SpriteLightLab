export const INTERNAL_DRAG_TYPE = 'application/x-sprite-light-lab-internal'
export const MATCH_DRAG_TYPE = 'application/x-sprite-light-match'

type DragTransferEvent = Pick<DragEvent, 'dataTransfer'>

function transferTypes(event: DragTransferEvent): string[] {
  return event.dataTransfer ? Array.from(event.dataTransfer.types) : []
}

export function markInternalDrag(event: DragTransferEvent): void {
  const transfer = event.dataTransfer
  if (!transfer) return
  transfer.effectAllowed = 'move'
  transfer.setData(INTERNAL_DRAG_TYPE, '1')
}

export function isInternalDrag(event: DragTransferEvent): boolean {
  const types = transferTypes(event)
  return types.includes(INTERNAL_DRAG_TYPE) || types.includes(MATCH_DRAG_TYPE)
}

export function isExternalFileDrag(event: DragTransferEvent): boolean {
  if (isInternalDrag(event)) return false
  return transferTypes(event).includes('Files')
}