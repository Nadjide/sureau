import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createFurniture, findFreeFurniturePlacement, furnitureCatalog } from './furniture-catalog'
import { FurnitureIcon } from './furniture-summary'
import type { FurnitureKind, SpatialPlan } from './room-model'

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
