import { useState } from 'react'
import { Armchair, Columns3, Flower2, LibraryBig, Plus, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createFurniture, findFreeFurniturePlacement, furnitureCatalog } from './furniture-catalog'
import type { FurnitureItem, FurnitureKind, SpatialPlan } from './room-model'

const icons = { table: Table2, cabinet: LibraryBig, plant: Flower2, partition: Columns3, sofa: Armchair }

export function FurnitureIcon({ kind, size = 24 }: { kind: FurnitureKind; size?: number }) {
  const Icon = icons[kind]
  return <Icon size={size} strokeWidth={1.3} aria-hidden="true" />
}

export function FurnitureSummary({ item }: { item: FurnitureItem }) {
  const entry = furnitureCatalog.find((candidate) => candidate.kind === item.kind)!
  return <>
    <div className="inspector-hero"><FurnitureIcon kind={item.kind} size={34} /></div>
    <p className="eyebrow">MOBILIER DU PLAN</p>
    <h2>{item.label}</h2>
    <p className="location-help">{entry.label} · {entry.description}</p>
    <dl className="asset-specs">
      <div><dt>Dimensions</dt><dd>{Math.round(item.width * 100)} × {Math.round(item.depth * 100)} cm</dd></div>
      <div><dt>Hauteur</dt><dd>{Math.round(item.height * 100)} cm</dd></div>
      <div><dt>Orientation</dt><dd>{Math.round(item.rotation * 180 / Math.PI)}°</dd></div>
      <div><dt>Couleur</dt><dd><span className="furniture-color-sample" style={{ background: item.color }} />{item.color}</dd></div>
    </dl>
  </>
}

interface Props { plan: SpatialPlan; onChange: (plan: SpatialPlan) => void; onSelect: (id: string) => void }

export function FurnitureCatalogPanel({ plan, onChange, onSelect }: Props) {
  const [error, setError] = useState<string | null>(null)
  function add(kind: FurnitureKind) {
    if (plan.furniture.length >= 64) { setError('Cette salle peut accueillir jusqu’à 64 meubles.'); return }
    const template = createFurniture(kind, `furniture-${crypto.randomUUID()}`)
    let index = 1
    while (plan.furniture.some((item) => item.label === `${template.label} ${String(index).padStart(2, '0')}`)) index++
    template.label = `${template.label} ${String(index).padStart(2, '0')}`
    const item = findFreeFurniturePlacement(plan, template)
    if (!item) { setError('Il manque une place libre pour ce meuble. Réorganisez ou agrandissez la pièce.'); return }
    onChange({ ...plan, furniture: [...plan.furniture, item], display: { ...plan.display, decor: kind === 'plant' || kind === 'cabinet' ? true : plan.display.decor } })
    onSelect(item.id)
    setError(null)
  }
  return <section aria-label="Catalogue de mobilier">
    <p className="eyebrow">LES PIÈCES DE VOTRE ESPACE</p>
    <h3 className="catalog-title">Du mobilier, à composer.</h3>
    <p className="location-help">Ajoutez un meuble à sa taille réelle. Il se place dans une zone libre du plateau.</p>
    <div className="furniture-catalog">
      {furnitureCatalog.map((entry) => <article className="catalog-card" key={entry.kind}>
        <div className={`catalog-thumbnail catalog-${entry.kind}`}><FurnitureIcon kind={entry.kind} size={42} /><span>{entry.width} × {entry.depth} m</span></div>
        <div className="catalog-card-body"><h4>{entry.label}</h4><p>{entry.description}</p>
          <Button size="sm" variant="outline" onClick={() => add(entry.kind)} disabled={plan.furniture.length >= 64} aria-label={`Ajouter : ${entry.label}`}><Plus size={13} />Ajouter</Button>
        </div>
      </article>)}
    </div>
    {error && <p className="storage-warning" role="alert">{error}</p>}
    <p className="location-help">Le mobilier décrit l’implantation. Les équipements de l’inventaire restent liés aux postes de travail.</p>
  </section>
}
