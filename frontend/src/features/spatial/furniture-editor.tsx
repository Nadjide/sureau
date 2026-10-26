import { useState, type FormEvent } from 'react'
import { Copy, RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { FurnitureIcon } from './furniture-summary'
import { clampFurniture, findFreeFurniturePlacement, mixedOverlaps, normalizeRotation } from './plan-geometry'
import type { FurnitureItem, SpatialPlan } from './room-model'

export function FurnitureEditor({ item, plan, onChange, onSelect }: {
  item: FurnitureItem; plan: SpatialPlan; onChange: (plan: SpatialPlan) => void; onSelect: (id: string | null) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const conflicts = [...plan.workstations, ...plan.furniture].filter((other) => other.id !== item.id && mixedOverlaps(item, other))

  function update(candidate: FurnitureItem) {
    try {
      const bounded = clampFurniture(plan, candidate)
      onChange({ ...plan, furniture: plan.furniture.map((other) => other.id === item.id ? bounded : other) })
      setError(null)
    } catch { setError(t('Ce meuble ne rentre pas dans la salle. Réduisez ses dimensions ou ajustez son orientation.')) }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') || '').trim(), color = String(data.get('color'))
    const x = Number(data.get('x')), z = Number(data.get('z')), rotation = Number(data.get('rotation'))
    const width = Number(data.get('width')), depth = Number(data.get('depth')), height = Number(data.get('height'))
    if (!label || label.length > 60 || !/^#[0-9a-fA-F]{6}$/.test(color)
      || ![x, z, rotation, width, depth, height].every(Number.isFinite)
      || width < 0.2 || width > 6 || depth < 0.08 || depth > 4 || height < 0.15 || height > 3.5) {
      setError(t('Vérifiez le nom, la couleur et les dimensions du meuble.')); return
    }
    update({ ...item, label, color, width, depth, height,
      position: [x === Math.round(item.position[0] * 100) / 100 ? item.position[0] : x, 0, z === Math.round(item.position[2] * 100) / 100 ? item.position[2] : z],
      rotation: rotation === Math.round(item.rotation * 180 / Math.PI) ? item.rotation : normalizeRotation((rotation % 360) * Math.PI / 180),
    })
  }

  return <section aria-label={t('Modifier {name}', { name: item.label })}>
    <div className="editor-section-title"><h3><FurnitureIcon kind={item.kind} size={18} /> {item.label}</h3></div>
    <form className="editor-form" key={JSON.stringify(item)} onSubmit={apply}>
      <label>{t('Nom du meuble')}<input name="label" defaultValue={item.label} maxLength={60} required /></label>
      <div className="editor-field-pair">
        <label>Position X (m)<input name="x" type="number" step="any" defaultValue={Math.round(item.position[0] * 100) / 100} required /></label>
        <label>Position Z (m)<input name="z" type="number" step="any" defaultValue={Math.round(item.position[2] * 100) / 100} required /></label>
      </div>
      <label>Orientation (°)<input name="rotation" type="number" step="any" defaultValue={Math.round(item.rotation * 180 / Math.PI)} required /></label>
      <div className="editor-field-pair">
        <label>Largeur (m)<input name="width" type="number" min="0.2" max="6" step="any" defaultValue={item.width} required /></label>
        <label>Profondeur (m)<input name="depth" type="number" min="0.08" max="4" step="any" defaultValue={item.depth} required /></label>
      </div>
      <div className="editor-field-pair">
        <label>Hauteur (m)<input name="height" type="number" min="0.15" max="3.5" step="any" defaultValue={item.height} required /></label>
        <label>{t('Couleur du meuble')}<input name="color" type="color" defaultValue={item.color} /></label>
      </div>
      <Button variant="outline" type="submit" className="w-full">{t('Appliquer au meuble')}</Button>
    </form>
    {error && <p className="storage-warning" role="alert">{error}</p>}
    {conflicts.length > 0 && <p className="storage-warning" role="status">{t('Ce meuble chevauche : {names}.', { names: conflicts.map((other) => other.label).join(', ') })}</p>}
    <div className="editor-actions">
      <Button variant="outline" onClick={() => update({ ...item, rotation: normalizeRotation(item.rotation + Math.PI / 2) })}><RotateCw />{t('Pivoter de 90°')}</Button>
      <Button variant="outline" disabled={plan.furniture.length >= 64} onClick={() => {
        const copy = findFreeFurniturePlacement(plan, { ...item, id: `furniture-${crypto.randomUUID()}`, label: t('{name} (copie)', { name: item.label.slice(0, 52) }) })
        if (!copy) { setError(t('Il manque une zone libre pour cette copie.')); return }
        onChange({ ...plan, furniture: [...plan.furniture, copy] }); onSelect(copy.id)
      }}><Copy />{t('Dupliquer')}</Button>
    </div>
    {deleting ? <div className="editor-delete-confirm"><p>{t('Supprimer ce meuble du plan ?')}</p>
      <Button variant="destructive" onClick={() => { onChange({ ...plan, furniture: plan.furniture.filter((other) => other.id !== item.id) }); onSelect(null) }}>{t('Confirmer la suppression')}</Button>
      <Button variant="ghost" onClick={() => setDeleting(false)}>{t('Conserver le meuble')}</Button>
    </div> : <Button variant="ghost" className="editor-delete" onClick={() => setDeleting(true)}><Trash2 />{t('Supprimer ce meuble')}</Button>}
  </section>
}
