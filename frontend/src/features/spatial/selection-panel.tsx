import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ListChecks, Copy, RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural, t } from '@/lib/i18n'
import type { SpatialPlan } from './room-model'
import {
  duplicateSelection,
  removeSelection,
  resolveSelection,
  rotateSelection,
  translateSelection,
} from './plan-selection'

// The arrow buttons name the direction of the move.
const moveLabels = {
  gauche: () => t('Déplacer la sélection vers la gauche'),
  haut: () => t('Déplacer la sélection vers la partie haute'),
  bas: () => t('Déplacer la sélection vers la partie basse'),
  droite: () => t('Déplacer la sélection vers la droite'),
}

export function SelectionPanel({
  plan,
  ids,
  onChange,
  onSelectionChange,
}: {
  plan: SpatialPlan
  ids: readonly string[]
  onChange: (plan: SpatialPlan) => void
  onSelectionChange: (ids: string[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<SpatialPlan | null>(null)
  const items = resolveSelection(plan, ids)
  const anchor = items.at(-1)
  function action(run: () => void) {
    try {
      run()
      setError(null)
      setDeleting(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Cette action ne peut pas être appliquée à la sélection.'))
    }
  }
  return (
    <section aria-label={t('Objets sélectionnés')}>
      <div className="inspector-hero">
        <ListChecks size={34} />
      </div>
      <p className="eyebrow">{t('COMPOSER ENSEMBLE')}</p>
      <h3>{plural(items.length, '{count} objet sélectionné', '{count} objets sélectionnés')}</h3>
      <p className="location-help">
        {t('Glissez l’un des objets sélectionnés pour déplacer l’ensemble. Leurs écarts restent conservés.')}
      </p>
      <ul className="selection-members">
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
      <div className="selection-nudge" role="group" aria-label={t('Déplacer la sélection de 25 cm')}>
        {(
          [
            [ArrowLeft, -0.25, 0, 'gauche'],
            [ArrowUp, 0, -0.25, 'haut'],
            [ArrowDown, 0, 0.25, 'bas'],
            [ArrowRight, 0.25, 0, 'droite'],
          ] as const
        ).map(([Icon, x, z, direction]) => (
          <Button
            key={direction}
            variant="outline"
            size="icon"
            aria-label={moveLabels[direction]()}
            disabled={!anchor}
            onClick={() =>
              anchor &&
              onChange(translateSelection(plan, ids, anchor.id, anchor.position[0] + x, anchor.position[2] + z, false))
            }
          >
            <Icon />
          </Button>
        ))}
      </div>
      <p className="location-help">
        {t('Une flèche déplace l’ensemble de 25 cm. Annuler restaure toute la sélection en une fois.')}
      </p>
      <div className="editor-actions">
        <Button variant="outline" onClick={() => action(() => onChange(rotateSelection(plan, ids, Math.PI / 2)))}>
          <RotateCw />
          {t('Pivoter l’ensemble')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            action(() => {
              const copy = duplicateSelection(plan, ids)
              onChange(copy.plan)
              onSelectionChange(copy.selectedIds)
            })
          }
        >
          <Copy />
          {t('Dupliquer l’ensemble')}
        </Button>
      </div>
      <p className="location-help">
        {t(
          'La rotation de 90° et la copie conservent la disposition interne. Le matériel localisé reste associé aux postes d’origine.',
        )}
      </p>
      {error && (
        <p className="storage-warning" role="alert">
          {error}
        </p>
      )}
      {deleting ? (
        <div className="editor-delete-confirm">
          <p>
            {t('Supprimer les {count} objets sélectionnés ? Les liens de matériel restent récupérables avec Annuler.', {
              count: items.length,
            })}
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              if (deleting !== plan) {
                setError(t('Le plan a changé. Vérifiez la sélection avant de relancer la suppression.'))
                setDeleting(null)
                return
              }
              action(() => {
                onChange(removeSelection(plan, ids))
                onSelectionChange([])
              })
            }}
          >
            {t('Confirmer la suppression groupée')}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            {t('Conserver les objets')}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="editor-delete" onClick={() => setDeleting(plan)}>
          <Trash2 />
          {t('Supprimer la sélection')}
        </Button>
      )}
    </section>
  )
}
