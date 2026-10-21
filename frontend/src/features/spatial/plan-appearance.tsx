import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SpatialPlan } from './room-model'
import { clampWorkstation, overlaps } from './plan-geometry'
import { parsePlan } from './plan-document'

const palettes = [
  { name: 'Atelier', note: 'Bois clair et bleu ardoise', colors: { floor: '#e6e7e5', wall: '#e4e8ed', desk: '#d4b38c', accent: '#447cde' } },
  { name: 'Botanique', note: 'Sauge, crème et chêne', colors: { floor: '#dce4d8', wall: '#c3d1be', desk: '#b98c62', accent: '#397761' } },
  { name: 'Minéral', note: 'Pierre, graphite et noyer', colors: { floor: '#a6a9ad', wall: '#66717e', desk: '#755746', accent: '#bf8943' } },
  { name: 'Terracotta', note: 'Argile et tons naturels', colors: { floor: '#eddfcd', wall: '#cb9d88', desk: '#a57a58', accent: '#b05443' } },
] as const

interface Props { plan: SpatialPlan; onChange: (plan: SpatialPlan) => void }

function writeColorFields(form: HTMLFormElement | null, colors: SpatialPlan['colors']) {
  for (const [name, color] of Object.entries(colors)) {
    const field = form?.elements.namedItem(name)
    if (field instanceof HTMLInputElement) field.value = color
  }
}

export function PlanAppearance({ plan, onChange }: Props) {
  const form = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ plan: SpatialPlan; source: SpatialPlan; moved: number } | null>(null)
  const [formRevision, setFormRevision] = useState(0)
  const { floor, wall, desk, accent } = plan.colors
  useEffect(() => {
    writeColorFields(form.current, { floor, wall, desk, accent })
  }, [floor, wall, desk, accent])
  const collisions = plan.workstations.filter((station) => plan.workstations.some((other) => other.id !== station.id && overlaps(station, other))).length

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    const width = Number(data.get('width')), depth = Number(data.get('depth'))
    if (!name || name.length > 60 || ![width, depth].every(Number.isFinite) || width < 6 || depth < 6 || width > 50 || depth > 50) {
      setError('Indiquez un nom et des dimensions comprises entre 6 et 50 mètres.'); return
    }
    try {
      const candidate: SpatialPlan = {
        ...plan, name, width, depth,
        colors: { floor: String(data.get('floor')), wall: String(data.get('wall')), desk: String(data.get('desk')), accent: String(data.get('accent')) },
        display: { walls: data.has('walls'), decor: data.has('decor') },
      }
      candidate.workstations = plan.workstations.map((station) => clampWorkstation(candidate, station))
      const next = parsePlan(JSON.stringify(candidate))
      const moved = next.workstations.filter((station, index) => {
        const previous = plan.workstations[index]!
        return Math.abs(station.position[0] - previous.position[0]) > 1e-6 || Math.abs(station.position[2] - previous.position[2]) > 1e-6
      }).length
      setError(null)
      if (moved) setPending({ plan: next, source: plan, moved })
      else onChange(next)
    } catch { setError('Ces réglages ne permettent pas de placer le mobilier. Aucun changement appliqué.') }
  }

  return <div className="appearance-panel">
    <p className="location-help">Faites du plateau votre espace : dimensions réelles, matières, couleurs et environnement.</p>
    <h3 className="editor-subheading"><Palette size={14} />Ambiances</h3>
    <div className="palette-list">
      {palettes.map((palette) => {
        const active = Object.entries(palette.colors).every(([key, value]) => plan.colors[key as keyof SpatialPlan['colors']] === value)
        return <button key={palette.name} className={`palette-choice${active ? ' is-selected' : ''}`} type="button" aria-pressed={active} disabled={!!pending} onClick={() => {
          writeColorFields(form.current, palette.colors)
          onChange({ ...plan, colors: { ...palette.colors } })
        }}>
          <span className="palette-swatches" aria-hidden="true">{Object.values(palette.colors).map((color) => <i key={color} style={{ background: color }} />)}</span>
          <span><strong>{palette.name}</strong><small>{palette.note}</small></span>{active && <Check size={14} />}
        </button>
      })}
    </div>
    <form ref={form} className="editor-form" key={JSON.stringify([formRevision, plan.name, plan.width, plan.depth, plan.display])} onSubmit={apply}>
      <fieldset disabled={!!pending} className="editor-form appearance-fields">
        <label>Nom du plateau<input name="name" defaultValue={plan.name} maxLength={60} required /></label>
        <div className="editor-field-pair">
          <label>Largeur (m)<input name="width" type="number" min="6" max="50" step="any" defaultValue={plan.width} required /></label>
          <label>Profondeur (m)<input name="depth" type="number" min="6" max="50" step="any" defaultValue={plan.depth} required /></label>
        </div>
        <h3 className="editor-subheading">Couleurs libres</h3>
        <div className="editor-field-pair color-fields">
          <label>Sol<input name="floor" type="color" defaultValue={plan.colors.floor} /></label>
          <label>Murs<input name="wall" type="color" defaultValue={plan.colors.wall} /></label>
          <label>Bureaux<input name="desk" type="color" defaultValue={plan.colors.desk} /></label>
          <label>Sélection<input name="accent" type="color" defaultValue={plan.colors.accent} /></label>
        </div>
        <label className="editor-checkbox"><input name="walls" type="checkbox" defaultChecked={plan.display.walls} />Afficher les murs</label>
        <label className="editor-checkbox"><input name="decor" type="checkbox" defaultChecked={plan.display.decor} />Afficher plantes et rangement</label>
        <Button variant="outline" type="submit">Appliquer au plateau</Button>
      </fieldset>
    </form>
    {pending && <div className="editor-delete-confirm" role="alert">
      <p>Les nouvelles dimensions replaceront {pending.moved} poste(s) dans les limites de la pièce. Des chevauchements sont possibles.</p>
      <Button onClick={() => {
        if (pending.source !== plan) setError('Le plan a changé pendant ce réglage. Réappliquez les dimensions pour conserver vos derniers déplacements.')
        else onChange(pending.plan)
        setPending(null)
      }}>Appliquer et replacer</Button>
      <Button variant="ghost" onClick={() => { setPending(null); setFormRevision((value) => value + 1) }}>Garder les dimensions actuelles</Button>
    </div>}
    {error && <p className="storage-warning" role="alert">{error}</p>}
    {collisions > 0 && <p className="storage-warning" role="status">{collisions} postes se chevauchent. Ajustez-les dans le plan ou dans l’onglet Poste.</p>}
    <p className="location-help">Les couleurs propres à un poste restent prioritaires sur l’ambiance. Tous ces réglages sont locaux à ce navigateur.</p>
  </div>
}
