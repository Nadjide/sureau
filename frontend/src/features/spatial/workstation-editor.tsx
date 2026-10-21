import { useState, type FormEvent } from 'react'
import { Copy, Plus, RotateCw, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { findWorkstation, type SpatialPlan, type Workstation } from './room-model'
import { clampWorkstation, findFreePlacement, normalizeRotation, overlaps } from './plan-geometry'
import { PlanAppearance } from './plan-appearance'
import { PlanTransferPanel } from './plan-transfer-panel'

interface Props {
  plan: SpatialPlan
  persisted: boolean
  selectedId: string | null
  onChange: (plan: SpatialPlan) => void
  onSelect: (id: string | null) => void
}

export function WorkstationEditor({ plan, persisted, selectedId, onChange, onSelect }: Props) {
  const station = findWorkstation(selectedId, plan.workstations)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [section, setSection] = useState<'station' | 'appearance' | 'files'>('station')
  const conflicts = station ? plan.workstations.filter((item) => item.id !== station.id && overlaps(item, station)) : []

  function update(candidate: Workstation) {
    try {
      const bounded = clampWorkstation(plan, candidate)
      onChange({ ...plan, workstations: plan.workstations.map((item) => item.id === bounded.id ? bounded : item) })
      setError(null)
    } catch {
      setError('Ce poste ne rentre pas dans le plateau. Vérifiez ses dimensions.')
    }
  }

  function add(source?: Workstation) {
    if (plan.workstations.length >= 64) {
      setError('Ce plateau peut contenir jusqu’à 64 postes. Exportez un autre plateau pour organiser un nouvel espace.')
      return
    }
    let index = 1
    while (plan.workstations.some((item) => item.label === `Poste ${String(index).padStart(2, '0')}`)) index++
    const candidate: Workstation = source
      ? { ...source, id: `desk-${crypto.randomUUID()}`, label: `${source.label.slice(0, 52)} (copie)`, position: [...source.position] }
      : { id: `desk-${crypto.randomUUID()}`, label: `Poste ${String(index).padStart(2, '0')}`, position: [0, 0, 0], rotation: 0, width: 2, depth: 1, color: null }
    const placed = findFreePlacement(plan, candidate)
    if (!placed) {
      setError('Aucune place libre pour ce poste. Déplacez le mobilier ou agrandissez le plateau.')
      return
    }
    onChange({ ...plan, workstations: [...plan.workstations, placed] })
    onSelect(placed.id)
    setDeleting(null)
    setError(null)
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!station) return
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') || '').trim()
    if (!label || label.length > 60) { setError('Donnez un nom de 1 à 60 caractères au poste.'); return }
    const enteredX = Number(data.get('x')), enteredZ = Number(data.get('z'))
    const rotation = Number(data.get('rotation')), width = Number(data.get('width')), depth = Number(data.get('depth'))
    const x = enteredX === Math.round(station.position[0] * 100) / 100 ? station.position[0] : enteredX
    const z = enteredZ === Math.round(station.position[2] * 100) / 100 ? station.position[2] : enteredZ
    if (![x, z, rotation, width, depth].every(Number.isFinite) || width < 0.8 || width > 3 || depth < 0.5 || depth > 1.5) {
      setError('Vérifiez les valeurs et les dimensions du bureau.'); return
    }
    const angle = rotation === Math.round(station.rotation * 180 / Math.PI)
      ? station.rotation : normalizeRotation((rotation % 360) * Math.PI / 180)
    const color = data.has('inheritColor') ? null : String(data.get('color'))
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) { setError('Choisissez une couleur valide.'); return }
    update({ ...station, label, position: [x, 0, z], rotation: angle, width, depth, color })
  }

  return (
    <aside className="asset-inspector plan-editor" aria-label="Éditeur du plateau">
      <div className="editor-heading"><Wrench size={18} /><div><p className="eyebrow">ATELIER SPATIAL</p><h2>Composer l’espace</h2></div></div>
      <div className="editor-tabs" role="group" aria-label="Réglages de l’atelier">
        <button type="button" aria-pressed={section === 'station'} onClick={() => setSection('station')}>Poste</button>
        <button type="button" aria-pressed={section === 'appearance'} onClick={() => setSection('appearance')}>Plateau & couleurs</button>
        <button type="button" aria-pressed={section === 'files'} onClick={() => setSection('files')}>Fichiers</button>
      </div>
      {section === 'files' ? <PlanTransferPanel plan={plan} persisted={persisted} onChange={onChange} /> : section === 'appearance' ? <PlanAppearance plan={plan} onChange={onChange} /> : <>
      <p className="location-help">Créez votre implantation, poste par poste. {persisted ? 'Chaque changement est conservé dans ce navigateur.' : 'Vos changements restent dans cette session. Exportez pour garder une copie.'}</p>
      <Button className="w-full" onClick={() => add()} disabled={plan.workstations.length >= 64}><Plus />Ajouter un poste</Button>
      {error && <p className="storage-warning" role="alert">{error}</p>}
      {station ? <>
        <div className="editor-section-title"><h3>{station.label}</h3><span>{plan.workstations.indexOf(station) + 1} / {plan.workstations.length}</span></div>
        <form key={JSON.stringify(station)} className="editor-form" onSubmit={apply}>
          <label>Nom du poste<input name="label" defaultValue={station.label} maxLength={60} required /></label>
          <div className="editor-field-pair">
            <label>Position X (m)<input name="x" type="number" step="any" defaultValue={Math.round(station.position[0] * 100) / 100} required /></label>
            <label>Position Z (m)<input name="z" type="number" step="any" defaultValue={Math.round(station.position[2] * 100) / 100} required /></label>
          </div>
          <label>Orientation (°)<input name="rotation" type="number" step="any" defaultValue={Math.round(station.rotation * 180 / Math.PI)} required /></label>
          <div className="editor-field-pair">
            <label>Largeur (m)<input name="width" type="number" min="0.8" max="3" step="any" defaultValue={station.width} required /></label>
            <label>Profondeur (m)<input name="depth" type="number" min="0.5" max="1.5" step="any" defaultValue={station.depth} required /></label>
          </div>
          <label>Couleur du poste<input name="color" type="color" defaultValue={station.color || plan.colors.desk} onChange={(event) => {
            const inherit = event.currentTarget.form?.elements.namedItem('inheritColor')
            if (inherit instanceof HTMLInputElement) inherit.checked = false
          }} /></label>
          <label className="editor-checkbox"><input name="inheritColor" type="checkbox" defaultChecked={station.color === null} />Utiliser la couleur de l’ambiance</label>
          <p className="location-help">Le centre du plateau est le point 0, 0. Le poste reste dans les limites de la pièce, fauteuil compris.</p>
          <Button variant="outline" type="submit" className="w-full">Appliquer au poste</Button>
        </form>
        {conflicts.length > 0 && <p className="storage-warning" role="status">Ce poste chevauche : {conflicts.map((item) => item.label).join(', ')}. Vous pouvez ajuster l’implantation.</p>}
        <div className="editor-actions">
          <Button variant="outline" onClick={() => update({ ...station, rotation: normalizeRotation(station.rotation + Math.PI / 2) })}><RotateCw />Pivoter de 90°</Button>
          <Button variant="outline" onClick={() => add(station)} disabled={plan.workstations.length >= 64}><Copy />Dupliquer</Button>
        </div>
        {deleting === station.id ? <div className="editor-delete-confirm">
          <p>Supprimer ce poste ? Ses localisations de matériel restent récupérables.</p>
          <Button variant="destructive" onClick={() => {
            const next = plan.workstations.filter((item) => item.id !== station.id)
            onChange({ ...plan, workstations: next }); onSelect(next[0]?.id || null); setDeleting(null)
          }}>Confirmer la suppression</Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>Conserver le poste</Button>
        </div> : <Button variant="ghost" className="editor-delete" onClick={() => setDeleting(station.id)}><Trash2 />Supprimer ce poste</Button>}
      </> : <div className="editor-empty"><p>Sélectionnez un poste dans le plan pour modifier ses propriétés, ou ajoutez le premier poste de votre espace.</p></div>}
      </>}
    </aside>
  )
}
