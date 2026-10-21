import type { SpatialPlan } from './room-model'

interface Props {
  plan: SpatialPlan
  selectedWorkstationId: string | null
  onSelect: (id: string) => void
}

export function RoomPlan({ plan, selectedWorkstationId, onSelect }: Props) {
  const scale = Math.min(650 / plan.width, 450 / plan.depth)
  const width = plan.width * scale
  const depth = plan.depth * scale
  const left = 410 - width / 2
  const top = 290 - depth / 2
  return (
    <svg className="room-plan" viewBox="0 0 820 590" role="group" aria-label={`Plan 2D de ${plan.name}. ${plan.workstations.length} postes sélectionnables au clavier.`}>
      <defs><pattern id="room-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="var(--border)" strokeWidth=".65" /></pattern></defs>
      <rect x={left} y={top} width={width} height={depth} rx="4" fill={plan.colors.floor} />
      <rect x={left} y={top} width={width} height={depth} fill="url(#room-grid)" />
      <rect x={left} y={top} width={width} height={depth} fill="none" stroke={plan.colors.wall} strokeWidth="5" />
      <text x="410" y={top - 20} textAnchor="middle">{plan.width} m</text><text x={left - 26} y="290" textAnchor="middle" transform={`rotate(-90 ${left - 26} 290)`}>{plan.depth} m</text>
      {plan.workstations.map(station => {
        const x = 410 + station.position[0] * scale
        const y = 290 + station.position[2] * scale
        const selected = selectedWorkstationId === station.id
        return <g key={station.id} className={`plan-workstation${selected ? ' is-selected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`Sélectionner ${station.label} dans le plan 2D`} aria-pressed={selected} onClick={() => onSelect(station.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(station.id) } }}>
          <g transform={`rotate(${-station.rotation * 180 / Math.PI}) scale(${station.width / 2 * scale / 50},${station.depth * scale / 50})`}>
            <rect className="plan-hit" x="-53" y="-37" width="106" height="103" rx="9" style={selected ? { stroke: plan.colors.accent } : undefined} />
            <rect className="plan-table" x="-50" y="-25" width="100" height="50" rx="4" style={{ fill: station.color || plan.colors.desk }} />
            <rect className="plan-screen" x="-16" y="-15" width="32" height="5" rx="1" />
            <rect className="plan-keyboard" x="-13" y="3" width="26" height="9" rx="2" />
            <rect className="plan-chair" x="-15" y="33" width="30" height="27" rx="8" />
          </g>
          <text className="plan-label" x="0" y={-station.depth * scale / 2 - 12} textAnchor="middle">{station.label.length > 22 ? `${station.label.slice(0, 21)}…` : station.label}</text>
        </g>
      })}
      <text x="410" y="570" textAnchor="middle" className="plan-caption">Implantation locale · mobilier du plan</text>
    </svg>
  )
}
