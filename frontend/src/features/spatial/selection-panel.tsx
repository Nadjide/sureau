import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SpatialPlan } from './room-model'
import { resolveSelection, translateSelection } from './plan-selection'

export function SelectionPanel({ plan, ids, onChange }: { plan: SpatialPlan; ids: readonly string[]; onChange: (plan: SpatialPlan) => void }) {
  const items = resolveSelection(plan, ids)
  const anchor = items.at(-1)
  return <section aria-label="Objets sélectionnés">
    <div className="inspector-hero"><ListChecks size={34} /></div>
    <p className="eyebrow">COMPOSER ENSEMBLE</p><h3>{items.length} objets sélectionnés</h3>
    <p className="location-help">Glissez l’un des objets sélectionnés pour déplacer l’ensemble. Leurs écarts restent conservés.</p>
    <ul className="selection-members">{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    <div className="selection-nudge" role="group" aria-label="Déplacer la sélection de 25 cm">
      {([[ArrowLeft, -0.25, 0, 'gauche'], [ArrowUp, 0, -0.25, 'haut'], [ArrowDown, 0, 0.25, 'bas'], [ArrowRight, 0.25, 0, 'droite']] as const).map(([Icon, x, z, direction]) => <Button key={direction} variant="outline" size="icon" aria-label={`Déplacer la sélection vers la ${direction === 'haut' || direction === 'bas' ? direction === 'haut' ? 'partie haute' : 'partie basse' : direction}`} disabled={!anchor} onClick={() => anchor && onChange(translateSelection(plan, ids, anchor.id, anchor.position[0] + x, anchor.position[2] + z, false))}><Icon /></Button>)}
    </div>
    <p className="location-help">Une flèche déplace l’ensemble de 25 cm. Annuler restaure toute la sélection en une fois.</p>
  </section>
}
