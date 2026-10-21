import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { SpatialPlan, Workstation } from './room-model'
import { snapWorkstation } from './plan-geometry'

interface Props {
  plan: SpatialPlan
  editing: boolean
  snap: boolean
  onMove: (id: string, x: number, z: number) => void
  selectedWorkstationId: string | null
  onSelect: (id: string) => void
}

interface Drag {
  pointerId: number
  element: SVGGElement
  original: Workstation
  candidate: Workstation
  offsetX: number
  offsetZ: number
  startX: number
  startY: number
  moved: boolean
}

export function RoomPlan({ plan, editing, snap, onMove, selectedWorkstationId, onSelect }: Props) {
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Workstation | null>(null)
  const scale = Math.min(650 / plan.width, 450 / plan.depth)
  const width = plan.width * scale
  const depth = plan.depth * scale
  const left = 410 - width / 2
  const top = 290 - depth / 2
  const floorRgb = [1, 3, 5].map((offset) => parseInt(plan.colors.floor.slice(offset, offset + 2), 16))
  const ink = floorRgb[0]! * 0.299 + floorRgb[1]! * 0.587 + floorRgb[2]! * 0.114 > 145 ? '#243244' : '#f3f6fb'

  function cancelDrag() {
    const current = drag.current
    drag.current = null
    setPreview(null)
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
  }

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelDrag() }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancelDrag)
    return () => { cancelDrag(); window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancelDrag) }
  }, [plan, editing])

  function point(event: ReactPointerEvent<SVGElement>) {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget as SVGSVGElement
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const value = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: (value.x - 410) / scale, z: (value.y - 290) / scale }
  }

  return (
    <svg className={`room-plan${editing ? ' is-editing' : ''}`} viewBox="0 0 820 590" role="group" aria-label={`Plan 2D de ${plan.name}. ${plan.workstations.length} postes sélectionnables au clavier.`}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        const value = point(event)
        if (!value) return
        if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 3) return
        event.preventDefault()
        current.moved = true
        current.candidate = snapWorkstation(plan, { ...current.original, position: [value.x - current.offsetX, 0, value.z - current.offsetZ] }, snap)
        setPreview(current.candidate)
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        cancelDrag()
        if (current.moved) onMove(current.original.id, current.candidate.position[0], current.candidate.position[2])
      }}
      onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
      <defs><pattern id="room-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="var(--border)" strokeWidth=".65" /></pattern></defs>
      <rect x={left} y={top} width={width} height={depth} rx="4" fill={plan.colors.floor} />
      <rect x={left} y={top} width={width} height={depth} fill="url(#room-grid)" />
      <rect x={left} y={top} width={width} height={depth} fill="none" stroke={plan.colors.wall} strokeWidth="5" />
      <text x="410" y={top - 20} textAnchor="middle">{plan.width} m</text><text x={left - 26} y="290" textAnchor="middle" transform={`rotate(-90 ${left - 26} 290)`}>{plan.depth} m</text>
      {plan.workstations.map(original => {
        const station = preview?.id === original.id ? preview : original
        const x = 410 + station.position[0] * scale
        const y = 290 + station.position[2] * scale
        const selected = selectedWorkstationId === station.id
        return <g key={station.id} className={`plan-workstation${selected ? ' is-selected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`Sélectionner ${station.label} dans le plan 2D`} aria-pressed={selected}
          onPointerDown={(event) => {
            if (!editing || event.button !== 0) return
            const value = point(event)
            if (!value) return
            event.preventDefault()
            onSelect(station.id)
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { pointerId: event.pointerId, element: event.currentTarget, original: station, candidate: station, offsetX: value.x - station.position[0], offsetZ: value.z - station.position[2], startX: event.clientX, startY: event.clientY, moved: false }
          }}
          onClick={() => onSelect(station.id)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(station.id) }
            if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            const step = (snap ? 0.25 : 0.1) * (event.shiftKey ? 4 : 1)
            onSelect(station.id)
            onMove(station.id, station.position[0] + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), station.position[2] + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
          }}>
          <g transform={`rotate(${-station.rotation * 180 / Math.PI}) scale(${station.width / 2 * scale / 50},${station.depth * scale / 50})`}>
            <rect className="plan-hit" x="-53" y="-37" width="106" height="103" rx="9" style={selected ? { stroke: plan.colors.accent } : undefined} />
            <rect className="plan-table" x="-50" y="-25" width="100" height="50" rx="4" style={{ fill: station.color || plan.colors.desk }} />
            <rect className="plan-screen" x="-16" y="-15" width="32" height="5" rx="1" />
            <rect className="plan-keyboard" x="-13" y="3" width="26" height="9" rx="2" />
            <rect className="plan-chair" x="-15" y="33" width="30" height="27" rx="8" />
          </g>
          <text className="plan-label" x="0" y={(Math.cos(station.rotation) >= 0 ? -1 : 1) * (Math.abs(Math.cos(station.rotation)) * station.depth * scale / 2 + Math.abs(Math.sin(station.rotation)) * station.width * scale / 2 + 12)} textAnchor="middle" style={{ fill: ink, stroke: plan.colors.floor, strokeWidth: 3, paintOrder: 'stroke' }}>{station.label.length > 22 ? `${station.label.slice(0, 21)}…` : station.label}</text>
        </g>
      })}
      <text x="410" y="570" textAnchor="middle" className="plan-caption">Implantation locale · mobilier du plan</text>
    </svg>
  )
}
