import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { FurnitureItem, SpatialPlan, Workstation } from './room-model'
import { translateSelection } from './plan-selection'
import { plural, t } from '@/lib/i18n'

type PlanItem = Workstation | FurnitureItem

interface Props {
  plan: SpatialPlan
  editing: boolean
  canEdit?: boolean
  snap: boolean
  onMove: (id: string, x: number, z: number) => void
  selectedWorkstationId: string | null
  selectedIds: readonly string[]
  multipleMode: boolean
  onSelect: (id: string, additive?: boolean, preserve?: boolean) => void
}

interface Drag {
  pointerId: number
  element: SVGGElement
  original: PlanItem
  candidate: PlanItem
  ids: readonly string[]
  offsetX: number
  offsetZ: number
  startX: number
  startY: number
  moved: boolean
}

export function RoomPlan({ plan, editing, canEdit = true, snap, onMove, selectedWorkstationId, selectedIds, multipleMode, onSelect }: Props) {
  const effectiveEditing = editing && canEdit
  const drag = useRef<Drag | null>(null)
  const clickIntent = useRef<{ id: string; additive: boolean; handled: boolean } | null>(null)
  const [preview, setPreview] = useState<SpatialPlan | null>(null)
  const displayed = preview || plan
  const selectionKey = [...selectedIds].sort().join('|')
  const scale = Math.min(650 / plan.width, 450 / plan.depth)
  const width = plan.width * scale
  const depth = plan.depth * scale
  const left = 410 - width / 2
  const top = 290 - depth / 2
  const floorRgb = [1, 3, 5].map((offset) => parseInt(plan.colors.floor.slice(offset, offset + 2), 16))
  const ink = floorRgb[0]! * 0.299 + floorRgb[1]! * 0.587 + floorRgb[2]! * 0.114 > 145 ? '#243244' : '#f3f6fb'

  const cancelDrag = useCallback(() => {
    const current = drag.current
    drag.current = null
    setPreview(null)
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
  }, [])

  useEffect(() => {
    const current = drag.current
    if (!current) return
    const ids = selectionKey ? selectionKey.split('|') : []
    if (current.ids.length !== ids.length || current.ids.some((id) => !ids.includes(id))) cancelDrag()
  }, [selectionKey, cancelDrag])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelDrag() }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancelDrag)
    return () => { cancelDrag(); window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancelDrag) }
  }, [plan, effectiveEditing, cancelDrag])

  function point(event: ReactPointerEvent<SVGElement>) {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget as SVGSVGElement
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const value = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: (value.x - 410) / scale, z: (value.y - 290) / scale }
  }

  function selectionFor(id: string): readonly string[] {
    return selectedIds.includes(id) ? selectedIds : [id]
  }

  function beginDrag(event: ReactPointerEvent<SVGGElement>, item: PlanItem) {
    if (event.button !== 0 || drag.current) return
    const additive = effectiveEditing && (multipleMode || event.shiftKey || event.ctrlKey || event.metaKey)
    clickIntent.current = { id: item.id, additive, handled: false }
    if (!effectiveEditing || additive) return
    const value = point(event)
    if (!value) return
    event.preventDefault()
    onSelect(item.id, false, true)
    clickIntent.current.handled = true
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId, element: event.currentTarget, original: item, candidate: item, ids: [...selectionFor(item.id)],
      offsetX: value.x - item.position[0], offsetZ: value.z - item.position[2],
      startX: event.clientX, startY: event.clientY, moved: false,
    }
  }

  function itemClick(event: ReactMouseEvent<SVGGElement>, item: PlanItem) {
    const intent = clickIntent.current?.id === item.id && event.detail > 0 ? clickIntent.current : null
    clickIntent.current = null
    if (intent?.handled) return
    const additive = effectiveEditing && (intent?.additive ?? (multipleMode || event.shiftKey || event.ctrlKey || event.metaKey))
    onSelect(item.id, additive, !additive)
  }

  function itemKeyDown(event: ReactKeyboardEvent<SVGGElement>, item: PlanItem) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) {
        const additive = effectiveEditing && (multipleMode || event.shiftKey || event.ctrlKey || event.metaKey)
        onSelect(item.id, additive, !additive)
      }
    }
    if (!effectiveEditing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    if (drag.current) cancelDrag()
    const step = (snap ? 0.25 : 0.1) * (event.shiftKey ? 4 : 1)
    const projected = translateSelection(
      plan, selectionFor(item.id), item.id,
      item.position[0] + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      item.position[2] + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), snap,
    )
    const candidate = projected.workstations.find((station) => station.id === item.id)
      || projected.furniture.find((furniture) => furniture.id === item.id)
    if (!candidate) return
    onSelect(item.id, false, true)
    onMove(item.id, candidate.position[0], candidate.position[2])
  }

  return (
    <svg className={`room-plan${effectiveEditing ? ' is-editing' : ''}`} viewBox="0 0 820 590" role="group" aria-label={t('Plan 2D de {name}. {workstations} et {furniture} sélectionnables au clavier.', { name: plan.name, workstations: plural(plan.workstations.length, '{count} poste', '{count} postes'), furniture: plural(plan.furniture.length, '{count} meuble', '{count} meubles') })}
      onPointerMove={(event) => {
        if (!effectiveEditing) { cancelDrag(); return }
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        const value = point(event)
        if (!value) return
        if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 3) return
        event.preventDefault()
        current.moved = true
        const projected = translateSelection(plan, current.ids, current.original.id, value.x - current.offsetX, value.z - current.offsetZ, snap)
        current.candidate = projected.workstations.find((item) => item.id === current.original.id)
          || projected.furniture.find((item) => item.id === current.original.id) || current.original
        setPreview(projected === plan ? null : projected)
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        cancelDrag()
        if (effectiveEditing && current.moved) onMove(current.original.id, current.candidate.position[0], current.candidate.position[2])
      }}
      onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
      <defs><pattern id="room-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="var(--border)" strokeWidth=".65" /></pattern></defs>
      <rect x={left} y={top} width={width} height={depth} rx="4" fill={plan.colors.floor} />
      <rect x={left} y={top} width={width} height={depth} fill="url(#room-grid)" />
      <rect x={left} y={top} width={width} height={depth} fill="none" stroke={plan.colors.wall} strokeWidth="5" />
      <text x="410" y={top - 20} textAnchor="middle">{plan.width} m</text><text x={left - 26} y="290" textAnchor="middle" transform={`rotate(-90 ${left - 26} 290)`}>{plan.depth} m</text>
      {displayed.furniture.map((item, index) => {
        if (!plan.display.decor && (item.kind === 'plant' || item.kind === 'cabinet')) return null
        const selected = selectedIds.includes(item.id)
        const x = 410 + item.position[0] * scale, y = 290 + item.position[2] * scale
        const w = item.width * scale, d = item.depth * scale
        return <g key={item.id} className={`plan-workstation${selected ? ' is-selected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={t('Sélectionner le meuble {name} dans le plan 2D', { name: item.label })} aria-pressed={selected}
          onPointerDown={(event) => beginDrag(event, item)} onClick={(event) => itemClick(event, item)} onKeyDown={(event) => itemKeyDown(event, item)}>
          <title>{item.label}</title>
          <g transform={`rotate(${-item.rotation * 180 / Math.PI})`}>
            <rect className="plan-hit" x={-w / 2 - 4} y={-d / 2 - 4} width={w + 8} height={d + 8} rx="5" style={selected ? { stroke: plan.colors.accent } : undefined} />
            {item.kind === 'plant' ? <><ellipse rx={w / 2} ry={d / 2} fill={item.color} /><circle r={Math.min(w, d) * 0.22} fill="#56794c" /></> : <>
              <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={item.kind === 'sofa' ? 6 : 2} fill={item.color} stroke={ink} strokeWidth=".6" />
              {item.kind === 'cabinet' && <path d={`M0 ${-d / 2}V${d / 2}`} stroke={ink} strokeWidth="1" />}
              {item.kind === 'sofa' && <path d={`M${-w / 2 + 5} ${-d / 2 + 5}H${w / 2 - 5}M0 ${-d / 2 + 5}V${d / 2 - 4}`} stroke={ink} strokeWidth="1" fill="none" />}
            </>}
          </g>
          <text className="plan-label" y={-d / 2 - 10} textAnchor="middle" style={{ fill: ink, stroke: plan.colors.floor, strokeWidth: 3, paintOrder: 'stroke', fontSize: 15 }}>{plan.workstations.length + plan.furniture.length > 16 && !selected && selectedWorkstationId !== item.id ? String(plan.workstations.length + index + 1).padStart(2, '0') : item.label.slice(0, 22)}</text>
        </g>
      })}
      {displayed.workstations.map((station, index) => {
        const x = 410 + station.position[0] * scale
        const y = 290 + station.position[2] * scale
        const selected = selectedIds.includes(station.id)
        return <g key={station.id} className={`plan-workstation${selected ? ' is-selected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={t('Sélectionner {name} dans le plan 2D', { name: station.label })} aria-pressed={selected}
          onPointerDown={(event) => beginDrag(event, station)} onClick={(event) => itemClick(event, station)} onKeyDown={(event) => itemKeyDown(event, station)}>
          <title>{station.label}</title>
          <g transform={`rotate(${-station.rotation * 180 / Math.PI}) scale(${station.width / 2 * scale / 50},${station.depth * scale / 50})`}>
            <rect className="plan-hit" x="-53" y="-37" width="106" height="103" rx="9" style={selected ? { stroke: plan.colors.accent } : undefined} />
            <rect className="plan-table" x="-50" y="-25" width="100" height="50" rx="4" style={{ fill: station.color || plan.colors.desk }} />
            <rect className="plan-screen" x="-16" y="-15" width="32" height="5" rx="1" />
            <rect className="plan-keyboard" x="-13" y="3" width="26" height="9" rx="2" />
            <rect className="plan-chair" x="-15" y="33" width="30" height="27" rx="8" />
          </g>
          <text className="plan-label" x="0" y={(Math.cos(station.rotation) >= 0 ? -1 : 1) * (Math.abs(Math.cos(station.rotation)) * station.depth * scale / 2 + Math.abs(Math.sin(station.rotation)) * station.width * scale / 2 + 12)} textAnchor="middle" style={{ fill: ink, stroke: plan.colors.floor, strokeWidth: 3, paintOrder: 'stroke' }}>{plan.workstations.length + plan.furniture.length > 16 && !selected && selectedWorkstationId !== station.id ? String(index + 1).padStart(2, '0') : station.label.length > 22 ? `${station.label.slice(0, 21)}…` : station.label}</text>
        </g>
      })}
      <text x="410" y="570" textAnchor="middle" className="plan-caption">{t('Implantation de l’espace · mobilier du plan')}</text>
    </svg>
  )
}
