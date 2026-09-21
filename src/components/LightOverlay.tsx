import { useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

export function LightOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const lighting = useProjectStore((state) => state.lighting)
  const preferences = useProjectStore((state) => state.renderPreferences)
  const selectLight = useProjectStore((state) => state.selectLight)
  const updateLight = useProjectStore((state) => state.updateLight)

  if (!preferences.lightingEnabled) {
    return null
  }

  const draggableLights = lighting.lights.filter(
    (light) =>
      light.enabled &&
      light.type !== 'directional' &&
      light.showUi !== false,
  )

  return (
    <div ref={overlayRef} className="light-overlay" aria-label="光源拖拽层">
      {draggableLights.map((light) => {
        const selected = light.id === lighting.selectedLightId
        const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
          const bounds = overlayRef.current?.getBoundingClientRect()
          if (!bounds) {
            return
          }
          updateLight(
            light.id,
            {
              x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
              y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
            },
            false,
          )
        }

        return (
          <button
            type="button"
            key={light.id}
            className={`light-handle ${selected ? 'is-selected' : ''}`}
            style={{ left: `${light.x * 100}%`, top: `${light.y * 100}%`, color: light.color }}
            title={`${light.name}：拖拽移动`}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              selectLight(light.id)
              updateLight(light.id, { x: light.x, y: light.y }, true)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                handlePointerMove(event)
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
          >
            <span className="light-core" />
            {light.type === 'spot' && (
              <span
                className="spot-ray"
                style={{ transform: `rotate(${light.direction}deg)` }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}