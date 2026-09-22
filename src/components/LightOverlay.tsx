import { useRef } from 'react'
import type { LightSource } from '../domain/types'
import { useProjectStore } from '../store/projectStore'
import { t } from '../i18n'

function SpotCone({ light }: { light: LightSource }) {
  const halfAngle = (light.coneAngle * Math.PI) / 360
  const length = 100
  const x = Math.cos(halfAngle) * length
  const y = Math.sin(halfAngle) * length
  return (
    <svg
      className="spot-cone"
      viewBox="-4 -104 108 208"
      style={{
        width: `${light.radius * 200}%`,
        transform: `translate(0, -50%) rotate(${light.direction}deg)`,
      }}
      aria-hidden="true"
    >
      <path d={`M0 0 L${x} ${y} L${x} ${-y} Z`} />
    </svg>
  )
}

export function LightOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const lighting = useProjectStore((state) => state.lighting)
  const preferences = useProjectStore((state) => state.renderPreferences)
  const selectLight = useProjectStore((state) => state.selectLight)
  const updateLight = useProjectStore((state) => state.updateLight)

  if (!preferences.lightingEnabled) {
    return null
  }

  const positionedLights = lighting.lights.filter(
    (light) => light.enabled && light.handleVisible && light.type !== 'directional',
  )

  return (
    <div ref={overlayRef} className="light-overlay" aria-label={t('棋盘区域光源控制层')}>
      {positionedLights.map((light) => {
        const selected = light.id === lighting.selectedLightId
        const updateFromPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
          const bounds = overlayRef.current?.getBoundingClientRect()
          if (!bounds) return
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
          <div
            key={light.id}
            className={`light-position light-position-${light.type} ${selected ? 'is-selected' : ''}`}
            style={{ left: `${light.x * 100}%`, top: `${light.y * 100}%`, color: light.color }}
          >
            {light.type === 'point' && (
              <span
                className="point-light-radius"
                style={{ width: `${light.radius * 200}%` }}
                aria-hidden="true"
              />
            )}
            {light.type === 'spot' && <SpotCone light={light} />}
            <button
              type="button"
              className="light-handle"
              title={t('{name}：拖拽移动发光原点', { name: light.name })}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                selectLight(light.id)
                updateLight(light.id, { x: light.x, y: light.y }, true)
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
              <span className="light-core" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
