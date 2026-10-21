import { room, workstations } from './room-model'

interface Props {
  selectedWorkstationId: string | null
  onSelect: (id: string) => void
}

export function RoomPlan({ selectedWorkstationId, onSelect }: Props) {
  return (
    <svg className="room-plan" viewBox="0 0 820 590" role="group" aria-label="Plan 2D du Plateau A. Huit postes sélectionnables au clavier.">
      <defs><pattern id="room-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="var(--border)" strokeWidth=".65" /></pattern></defs>
      <rect x="85" y="65" width="650" height="450" rx="4" fill="var(--card)" />
      <rect x="85" y="65" width="650" height="450" fill="url(#room-grid)" />
      <path d="M85 515V65H735" stroke="var(--muted-foreground)" strokeWidth="5" fill="none" />
      <path d="M85 515H735V65" stroke="var(--border)" strokeWidth="2" fill="none" />
      <path d="M85 44H735M65 65V515" stroke="var(--muted-foreground)" strokeWidth=".7" fill="none" />
      <text x="410" y="33" textAnchor="middle">{room.width} m</text><text x="48" y="290" textAnchor="middle" transform="rotate(-90 48 290)">{room.depth} m</text>
      {workstations.map(station => {
        const x = 85 + (station.position[0] + room.width / 2) * 50
        const y = 65 + (station.position[2] + room.depth / 2) * 50
        const selected = selectedWorkstationId === station.id
        return <g key={station.id} className={`plan-workstation${selected ? ' is-selected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`Sélectionner ${station.label} dans le plan 2D`} aria-pressed={selected} onClick={() => onSelect(station.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(station.id) } }}>
          <rect className="plan-hit" x="-53" y="-37" width="106" height="103" rx="9" />
          <g transform={`rotate(${station.rotation * 180 / Math.PI})`}>
            <rect className="plan-table" x="-50" y="-25" width="100" height="50" rx="4" />
            <rect className="plan-screen" x="-16" y="-15" width="32" height="5" rx="1" />
            <rect className="plan-keyboard" x="-13" y="3" width="26" height="9" rx="2" />
            <rect className="plan-chair" x="-15" y="33" width="30" height="27" rx="8" />
          </g>
          <text className="plan-label" x="0" y={station.rotation ? 47 : -38} textAnchor="middle">{station.label}</text>
        </g>
      })}
      <text x="410" y="555" textAnchor="middle" className="plan-caption">Implantation d’exemple · mobilier illustratif</text>
    </svg>
  )
}
