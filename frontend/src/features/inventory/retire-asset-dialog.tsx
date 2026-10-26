import { useEffect, useRef, useState } from 'react'
import { Archive, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import { AssetStatus } from './asset-details'
import { getAsset, retireAsset } from './asset-mutations'
import type { Asset } from './asset-schema'
import './asset-form.css'

interface Props {
  asset: Asset
  canEdit: boolean
  onClose: () => void
  onRetired: (asset: Asset) => void
  onReloaded: (asset: Asset) => void
}

export function RetireAssetDialog({ asset, canEdit, onClose, onRetired, onReloaded }: Props) {
  const [current, setCurrent] = useState(asset)
  const [pending, setPending] = useState<'retire' | 'reload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requiresRefresh, setRequiresRefresh] = useState(false)
  const [refreshed, setRefreshed] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const cancel = useRef<HTMLButtonElement | null>(null)
  const eligible = current.status !== 'ASSIGNED' && current.status !== 'RETIRED'

  useEffect(() => () => { controller.current?.abort() }, [])

  async function reload() {
    if (controller.current || !canEdit) return
    const request = new AbortController()
    controller.current = request; setPending('reload'); setError(null)
    try {
      const latest = await getAsset(current.id, request.signal)
      if (request.signal.aborted) return
      setCurrent(latest); setRequiresRefresh(false); setRefreshed(true); onReloaded(latest)
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : t('La fiche n’a pas pu être actualisée. Aucun retrait n’a été envoyé.'))
    } finally {
      if (controller.current === request) { controller.current = null; setPending(null) }
    }
  }
  async function confirm() {
    if (controller.current || !canEdit || !eligible || requiresRefresh) return
    const request = new AbortController()
    controller.current = request; setPending('retire'); setError(null)
    try {
      const retired = await retireAsset(current.id, current.revision, request.signal)
      if (!request.signal.aborted) { onRetired(retired); onClose() }
    } catch (failure) {
      if (request.signal.aborted) return
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 412
        || failure.kind !== 'http' || (failure.status !== null && failure.status >= 500))) setRequiresRefresh(true)
      setError(failure instanceof ApiError && failure.status === 409
        ? t('Ce matériel ne peut pas être retiré dans son état actuel. Actualisez la fiche avant de confirmer à nouveau.')
        : failure instanceof Error ? failure.message : t('Le retrait n’a pas pu être confirmé. Actualisez la fiche avant de réessayer.'))
    } finally {
      if (controller.current === request) { controller.current = null; setPending(null) }
    }
  }
  function close() { if (!controller.current) onClose() }

  return <Dialog.Root open onOpenChange={(open) => { if (!open) close() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="asset-retire-overlay" />
      <Dialog.Content role="alertdialog" className="asset-retire-dialog"
        onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus() }}
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }} onInteractOutside={(event) => { if (pending) event.preventDefault() }}>
        <div className="asset-retire-icon"><Archive size={23} strokeWidth={1.5} aria-hidden="true" /></div>
        <Dialog.Title>{t('Retirer ce matériel du parc ?')}</Dialog.Title>
        <Dialog.Description>{t('L’équipement sera marqué « Retiré du parc ». Sa fiche et ses associations aux postes seront conservées.')}</Dialog.Description>
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={t('Fermer la confirmation de retrait')} disabled={Boolean(pending)} onClick={close}><X aria-hidden="true" /></Button>
        <div className="asset-retire-summary"><strong>{current.name}</strong><span>{current.assetTag}</span><AssetStatus asset={current} /></div>
        {refreshed && <p className="asset-retire-help" role="status">{t('La fiche a été actualisée. Vérifiez les informations ci-dessus avant de confirmer le retrait.')}</p>}
        {current.status === 'ASSIGNED' && <p className="asset-form-error" role="status">{t('Ce matériel est affecté. Désaffectez-le dans sa fiche et enregistrez cette modification avant de le retirer du parc.')}</p>}
        {current.status === 'RETIRED' && <p className="asset-retire-help" role="status">{t('Ce matériel est déjà retiré du parc. Aucune nouvelle action n’est nécessaire.')}</p>}
        {!canEdit && <p className="asset-form-error" role="status">{t('Une session avec les droits d’édition est nécessaire. La confirmation reste ouverte.')}</p>}
        {error && <p className="asset-form-error" role="alert">{error}</p>}
        {requiresRefresh && <div className="asset-conflict-actions"><p>{t('Le retrait est suspendu. Une actualisation ne relance aucune action : vous devrez confirmer à nouveau.')}</p><Button variant="outline" disabled={Boolean(pending) || !canEdit} onClick={() => { void reload() }}>{pending === 'reload' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}{t('Actualiser la fiche')}</Button></div>}
        <div className="asset-retire-footer"><Button ref={cancel} variant="outline" disabled={Boolean(pending)} onClick={close}>{current.status === 'RETIRED' ? t('Fermer') : t('Conserver dans le parc')}</Button><Button variant="destructive" disabled={Boolean(pending) || !canEdit || !eligible || requiresRefresh} onClick={() => { void confirm() }}>{pending === 'retire' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}{pending === 'retire' ? t('Retrait en cours…') : t('Confirmer le retrait')}</Button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
