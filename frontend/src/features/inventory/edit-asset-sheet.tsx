import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FilePenLine, LoaderCircle, RefreshCw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import { AssetFormFields } from './asset-form-fields'
import { assetToFormValues, type AssetFormField } from './asset-form-model'
import { formFieldErrors, parseAssetForm } from './asset-input'
import { getAsset, updateAsset } from './asset-mutations'
import type { Asset } from './asset-schema'
import './asset-form.css'

interface Props {
  asset: Asset
  canEdit: boolean
  onClose: () => void
  onSaved: (asset: Asset) => void
  onReloaded: (asset: Asset) => void
}

/** `asset` is the snapshot selected when opening, never the live inventory record. */
export function EditAssetSheet({ asset, canEdit, onClose, onSaved, onReloaded }: Props) {
  const [base, setBase] = useState(asset)
  const [values, setValues] = useState(() => assetToFormValues(asset))
  const [pending, setPending] = useState<'save' | 'reload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})
  const [conflict, setConflict] = useState(false)
  const [confirmation, setConfirmation] = useState<'close' | 'reload' | null>(null)
  const controller = useRef<AbortController | null>(null)
  const continueButton = useRef<HTMLButtonElement | null>(null)
  const dirty = JSON.stringify(values) !== JSON.stringify(assetToFormValues(base))

  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => { if (confirmation) continueButton.current?.focus() }, [confirmation])

  function requestClose() {
    if (controller.current) return
    if (dirty) { setConfirmation('close'); return }
    onClose()
  }
  function change(field: AssetFormField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setFields((previous) => { const next = { ...previous }; delete next[field]; return next })
  }
  async function reload() {
    if (controller.current || !canEdit) return
    const request = new AbortController()
    controller.current = request; setPending('reload'); setError(null)
    try {
      const current = await getAsset(base.id, request.signal)
      if (request.signal.aborted) return
      setBase(current); setValues(assetToFormValues(current)); setFields({}); setConflict(false); setConfirmation(null)
      onReloaded(current)
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : t('La fiche du serveur n’a pas pu être rechargée. Votre saisie est conservée.'))
    } finally {
      if (controller.current === request) { controller.current = null; setPending(null) }
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controller.current || !canEdit || conflict || confirmation) return
    setError(null); setFields({})
    const parsed = parseAssetForm(values)
    if (!parsed.success) {
      const errors = parsed.errors
      setFields(errors); setError(t('Vérifiez les champs indiqués avant d’enregistrer les modifications.'))
      const first = Object.keys(errors)[0]
      const input = first ? event.currentTarget.elements.namedItem(first) : null
      if (input instanceof HTMLElement) input.focus()
      return
    }
    const request = new AbortController()
    controller.current = request; setPending('save')
    try {
      const updated = await updateAsset(base.id, base.revision, parsed.data, request.signal)
      if (!request.signal.aborted) { onSaved(updated); onClose() }
    } catch (failure) {
      if (request.signal.aborted) return
      if (failure instanceof ApiError) {
        setFields(formFieldErrors(failure.fieldErrors))
        if (failure.status === 412 || failure.kind !== 'http' || (failure.status !== null && failure.status >= 500)) setConflict(true)
      }
      setError(failure instanceof ApiError && failure.status === 409 && failure.code !== 'ASSET_STATUS_CONFLICT'
        ? t('Cet identifiant ou ce numéro de série est déjà utilisé. Votre saisie est conservée ; modifiez la valeur avant de réessayer.')
        : failure instanceof Error ? failure.message : t('Les modifications n’ont pas pu être confirmées. Votre saisie est conservée.'))
    } finally {
      if (controller.current === request) { controller.current = null; setPending(null) }
    }
  }

  return <Sheet open onOpenChange={(open) => { if (!open) requestClose() }}>
    <SheetContent className="asset-form-sheet" showCloseButton={false}
      onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById('asset-edit-name')?.focus() }}
      onEscapeKeyDown={(event) => { if (pending || confirmation) { event.preventDefault(); if (!pending) setConfirmation(null) } }}
      onInteractOutside={(event) => { if (pending) event.preventDefault() }}>
      <SheetHeader><p className="eyebrow">{t('LE PARC ÉVOLUE AVEC VOUS')}</p><SheetTitle>{t('Modifier la fiche')}</SheetTitle><SheetDescription>{t('Mettez à jour les informations de {tag}. Sa localisation dans vos espaces sera conservée.', { tag: base.assetTag })}</SheetDescription></SheetHeader>
      <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={t('Fermer la modification du matériel')} disabled={Boolean(pending)} onClick={requestClose}><X aria-hidden="true" /></Button>
      <form className="asset-entry-form" noValidate onSubmit={(event) => { void submit(event) }}>
        <div className="asset-entry-scroll">
          <div className="asset-form-heading"><FilePenLine size={21} strokeWidth={1.5} aria-hidden="true" /><div><h3>{t('La fiche du matériel')}</h3><p>{t('Les champs marqués d’un astérisque sont obligatoires.')}</p></div></div>
          {!canEdit && <p className="asset-form-error" role="status">{t('Une session avec les droits d’édition est nécessaire pour enregistrer cette fiche. Votre saisie est conservée.')}</p>}
          <AssetFormFields prefix="asset-edit" values={values} fields={fields} disabled={Boolean(pending) || Boolean(confirmation) || !canEdit} onChange={change} retirementBlocked={base.status === 'ASSIGNED'} />
          {error && <p className="asset-form-error" role="alert">{error}</p>}
          {conflict && !confirmation && <div className="asset-conflict-actions"><p>{t('L’enregistrement est suspendu pour protéger les changements déjà effectués. Votre saisie reste affichée.')}</p><Button type="button" variant="outline" disabled={Boolean(pending) || !canEdit} onClick={() => setConfirmation('reload')}><RefreshCw aria-hidden="true" />{t('Recharger la fiche du serveur')}</Button></div>}
          {confirmation && <div className="asset-discard-confirm" role="alert"><h3>{confirmation === 'reload' ? t('Reprendre la version du serveur ?') : t('Quitter sans enregistrer ?')}</h3><p>{confirmation === 'reload' ? t('Votre saisie sera remplacée par les informations actuelles du serveur. Copiez les valeurs à conserver avant de continuer.') : t('Les modifications en cours de saisie seront effacées.')}</p><div><Button type="button" variant="outline" ref={continueButton} disabled={Boolean(pending)} onClick={() => setConfirmation(null)}>{t('Conserver ma saisie')}</Button><Button type="button" variant="ghost" disabled={Boolean(pending) || (confirmation === 'reload' && !canEdit)} onClick={() => { if (confirmation === 'reload') void reload(); else onClose() }}>{pending === 'reload' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{confirmation === 'reload' ? t('Remplacer par la version du serveur') : t('Effacer et fermer')}</Button></div></div>}
        </div>
        <div className="asset-form-footer"><Button type="button" variant="outline" disabled={Boolean(pending) || Boolean(confirmation)} onClick={requestClose}>{t('Annuler')}</Button><Button type="submit" disabled={Boolean(pending) || Boolean(confirmation) || !canEdit || conflict}>{pending === 'save' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{pending === 'save' ? 'Enregistrement…' : t('Enregistrer les modifications')}</Button></div>
      </form>
    </SheetContent>
  </Sheet>
}
