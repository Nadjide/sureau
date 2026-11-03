import { useState } from 'react'
import { CircleCheck, Cloud, Download, LoaderCircle, RefreshCw, Save, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime, t } from '@/lib/i18n'
import type { SpatialDraft } from './shared-workspace-model'
import type { SharedWorkspaceResult } from './use-shared-workspace'

interface Props {
  store: SharedWorkspaceResult
  canEdit: boolean
  hasOpenForms: boolean
  onReload: (confirmed?: boolean) => Promise<boolean>
  onExport: () => void
  exportNotice: { error: boolean; text: string } | null
}

export function WorkspaceConnectionBar({ store, canEdit, hasOpenForms, onReload, onExport, exportNotice }: Props) {
  const [confirmation, setConfirmation] = useState<{ draft: SpatialDraft; revision: number | null } | null>(null)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  if (!store.draft) return null
  const pending = store.loading || store.saving
  const title = store.saving
    ? t('Enregistrement en cours…')
    : store.loading
      ? t('Chargement de la version du serveur…')
      : store.blocked === 'conflict'
        ? t('Une autre version est disponible')
        : store.blocked === 'uncertain'
          ? t('Enregistrement à vérifier')
          : store.revision === 0
            ? t('Votre nouvel espace est un brouillon')
            : store.dirty
              ? t('Modifications à enregistrer')
              : t('Espace enregistré sur cette instance')
  const date = store.updatedAt ? formatDateTime(new Date(store.updatedAt), 'medium') : null

  function exportCopy() {
    try {
      onExport()
    } catch {
      /* The parent exposes the export failure in exportNotice. */
    }
  }

  function requestReload() {
    setConfirmationError(null)
    if ((store.dirty || store.blocked || hasOpenForms) && store.draft) {
      setConfirmation({ draft: store.draft, revision: store.revision })
    } else {
      void onReload()
    }
  }

  function confirmReload() {
    if (!confirmation || pending) return
    if (confirmation.draft !== store.draft || confirmation.revision !== store.revision) {
      setConfirmation(null)
      setConfirmationError(
        t(
          'Votre brouillon a changé pendant cette confirmation. Vérifiez votre travail, puis relancez le rechargement.',
        ),
      )
      return
    }
    setConfirmation(null)
    void onReload(true)
  }

  return (
    <section
      className={`workspace-connection${store.blocked ? ' has-conflict' : ''}`}
      aria-label={t('Enregistrement de l’espace partagé')}
    >
      <div className="workspace-connection-main">
        <span className="workspace-connection-icon" aria-hidden="true">
          {pending ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : store.blocked ? (
            <TriangleAlert size={18} />
          ) : store.dirty ? (
            <Cloud size={18} />
          ) : (
            <CircleCheck size={18} />
          )}
        </span>
        <div className="workspace-connection-copy">
          <p role="status">
            <strong>{title}</strong>
          </p>
          <p>
            {store.revision ? (
              <>
                Version {store.revision}
                {date && (
                  <>
                    {' '}
                    · <time dateTime={store.updatedAt!}>{date}</time>
                  </>
                )}
              </>
            ) : (
              t('Préparez votre implantation, puis enregistrez-la pour votre équipe.')
            )}
          </p>
        </div>
        <div className="workspace-connection-actions">
          <Button variant="ghost" size="sm" disabled={pending} onClick={requestReload}>
            <RefreshCw />
            {t('Recharger')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCopy}>
            <Download />
            {t('Exporter le brouillon')}
          </Button>
          {canEdit && (
            <Button
              size="sm"
              disabled={pending || !store.dirty || Boolean(store.blocked) || Boolean(confirmation)}
              onClick={() => {
                void store.save()
              }}
            >
              {store.saving ? <LoaderCircle className="animate-spin" /> : <Save />}
              {t('Enregistrer l’espace')}
            </Button>
          )}
        </div>
      </div>
      {!canEdit && (
        <p className="workspace-connection-help">
          {t('Lecture seule. Vous pouvez consulter et exporter cette version.')}
        </p>
      )}
      {store.dirty && !store.blocked && (
        <p className="workspace-connection-help">
          {t(
            'Les salles et les localisations seront enregistrées ensemble. Vos changements en cours restent dans ce brouillon.',
          )}
        </p>
      )}
      {store.error && (
        <p className="workspace-connection-error" role="alert">
          {store.error}
        </p>
      )}
      {store.warning && (
        <p className="workspace-connection-error" role="alert">
          {store.warning}
        </p>
      )}
      {confirmationError && (
        <p className="workspace-connection-error" role="alert">
          {confirmationError}
        </p>
      )}
      {confirmation && (
        <div className="workspace-reload-confirm" role="alert">
          <h3>{t('Remplacer votre travail par la version du serveur ?')}</h3>
          <p>
            {t(
              'Après un chargement réussi, votre brouillon, l’historique Annuler / Rétablir et les saisies non appliquées des ateliers ouverts seront remplacés. L’export conserve uniquement les changements déjà appliqués au brouillon : appliquez les champs à conserver avant de préparer votre copie.',
            )}
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={exportCopy}>
              <Download />
              {t('Garder une copie')}
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={confirmReload}>
              {t('Remplacer par la version du serveur')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmation(null)}>
              {t('Conserver mon brouillon')}
            </Button>
          </div>
        </div>
      )}
      {exportNotice && (
        <p
          className={exportNotice.error ? 'workspace-connection-error' : 'workspace-connection-help'}
          role={exportNotice.error ? 'alert' : 'status'}
        >
          {exportNotice.text}
        </p>
      )}
    </section>
  )
}
