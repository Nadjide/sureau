import { ArrowRight, Box, FilePlus2, Layers3, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import type { SharedWorkspaceResult } from './use-shared-workspace'
import type { InitialWorkspaceKind } from './shared-workspace-transfer'
import type { SpatialDraft } from './shared-workspace-model'
import { LocalWorkspaceRecoveryPanel } from './local-workspace-recovery-panel'

interface Props {
  store: Pick<SharedWorkspaceResult, 'phase' | 'loading' | 'error' | 'warning'>
  canEdit: boolean
  onInitialize: (kind: InitialWorkspaceKind) => void
  onRecover: (draft: SpatialDraft) => boolean
  onRetry: () => void
  onOpenInventory: () => void
}

export function WorkspaceStartPanel({ store, canEdit, onInitialize, onRecover, onRetry, onOpenInventory }: Props) {
  if (store.loading)
    return (
      <section
        className="workspace-start workspace-start-status"
        aria-label={t('Chargement de l’espace partagé')}
        role="status"
      >
        <LoaderCircle className="animate-spin" size={28} aria-hidden="true" />
        <h2>{t('Retrouvons vos espaces.')}</h2>
        <p>{t('Chargement des salles, du mobilier et des localisations de votre équipe…')}</p>
        <Button variant="outline" onClick={onOpenInventory}>
          {t('Consulter le matériel')}
          <ArrowRight />
        </Button>
      </section>
    )

  if (store.phase !== 'missing')
    return (
      <section className="workspace-start workspace-start-status" aria-label={t('Espace partagé indisponible')}>
        <Layers3 size={30} strokeWidth={1.3} aria-hidden="true" />
        <p className="eyebrow">{t('CONNEXION À VOTRE ESPACE')}</p>
        <h2>{t('L’espace n’a pas pu être chargé.')}</h2>
        <p role="alert">{store.error || t('Vérifiez votre connexion à cette instance Sureau, puis réessayez.')}</p>
        <p>{t('L’inventaire reste accessible pendant cette vérification.')}</p>
        <div className="workspace-start-actions">
          <Button onClick={onRetry}>
            <RefreshCw />
            {t('Réessayer le chargement de l’espace')}
          </Button>
          <Button variant="outline" onClick={onOpenInventory}>
            {t('Consulter le matériel')}
            <ArrowRight />
          </Button>
        </div>
      </section>
    )

  return (
    <section className="workspace-start" aria-label={t('Préparer le premier espace partagé')}>
      <div className="workspace-start-intro">
        <span className="workspace-start-symbol">
          <Layers3 size={28} strokeWidth={1.25} aria-hidden="true" />
        </span>
        <p className="eyebrow">{t('UNE PAGE À COMPOSER ENSEMBLE')}</p>
        <h2>{t('Faites place à votre équipe.')}</h2>
        <p>
          {t(
            'Votre instance n’a pas encore d’espace partagé. Commencez par une salle, puis composez vos étages, vos implantations et vos ambiances.',
          )}
        </p>
      </div>
      {canEdit ? (
        <>
          <div className="workspace-start-choices">
            <article>
              <FilePlus2 size={22} strokeWidth={1.4} aria-hidden="true" />
              <h3>{t('Votre premier plateau')}</h3>
              <p>{t('Une salle vide, à votre mesure. Ajoutez ensuite vos postes et votre mobilier.')}</p>
              <Button onClick={() => onInitialize('empty')}>
                {t('Créer une salle vide')}
                <ArrowRight />
              </Button>
            </article>
            <article>
              <Box size={22} strokeWidth={1.4} aria-hidden="true" />
              <h3>{t('Un exemple à explorer')}</h3>
              <p>
                {t(
                  'Un plateau meublé pour prendre en main l’atelier. Ces objets sont illustratifs et ne sont associés à aucun matériel de votre inventaire.',
                )}
              </p>
              <Button variant="outline" onClick={() => onInitialize('example')}>
                {t('Préparer l’exemple')}
                <ArrowRight />
              </Button>
            </article>
          </div>
          <p className="workspace-start-note">
            {t(
              'Votre choix prépare un brouillon. Le bouton « Enregistrer l’espace » le rendra disponible à votre équipe.',
            )}
          </p>
        </>
      ) : (
        <p className="workspace-start-note">
          {t(
            'Un administrateur ou un éditeur peut préparer le premier espace. Vous pouvez déjà consulter le matériel de votre équipe.',
          )}
        </p>
      )}
      {store.warning && (
        <p className="storage-warning" role="alert">
          {store.warning}
        </p>
      )}
      <LocalWorkspaceRecoveryPanel current={null} canEdit={canEdit} onRecover={onRecover} />
      <Button variant="ghost" onClick={onOpenInventory}>
        {t('Consulter le matériel')}
        <ArrowRight />
      </Button>
    </section>
  )
}
