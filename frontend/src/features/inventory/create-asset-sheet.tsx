import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, PackagePlus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import { formFieldErrors, parseAssetForm } from './asset-input'
import { createAsset } from './asset-mutations'
import type { Asset } from './asset-schema'
import { AssetFormFields } from './asset-form-fields'
import { emptyAssetForm, type AssetFormField } from './asset-form-model'
import './asset-form.css'

const initialValues = emptyAssetForm

export function CreateAssetSheet({ onCreated, canEdit }: { onCreated: (asset: Asset) => void; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(initialValues)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const continueButton = useRef<HTMLButtonElement | null>(null)
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues)

  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => { if (confirmClose) continueButton.current?.focus() }, [confirmClose])

  function close() {
    setOpen(false); setConfirmClose(false); setValues(initialValues); setError(null); setFields({})
  }
  function requestOpen(next: boolean) {
    if (next) { if (canEdit) setOpen(true); return }
    if (controller.current) return
    if (dirty) { setConfirmClose(true); return }
    close()
  }
  function update(field: AssetFormField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setFields((previous) => { const next = { ...previous }; delete next[field]; return next })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controller.current || !canEdit || confirmClose) return
    setError(null); setFields({})
    const parsed = parseAssetForm(values)
    if (!parsed.success) {
      const errors = parsed.errors
      setFields(errors); setError(t('Vérifiez les champs indiqués avant d’enregistrer le matériel.'))
      const first = Object.keys(errors)[0]
      const input = first ? event.currentTarget.elements.namedItem(first) : null
      if (input instanceof HTMLElement) input.focus()
      return
    }
    const request = new AbortController()
    controller.current = request
    setPending(true)
    try {
      const asset = await createAsset(parsed.data, request.signal)
      if (request.signal.aborted) return
      onCreated(asset)
      close()
    } catch (failure) {
      if (request.signal.aborted) return
      setError(failure instanceof ApiError && failure.status === 409
        ? t('Cet identifiant ou ce numéro de série est déjà utilisé. Votre saisie est conservée ; modifiez la valeur avant de réessayer.')
        : failure instanceof Error ? failure.message : t('Le matériel n’a pas pu être enregistré.'))
      if (failure instanceof ApiError) setFields(formFieldErrors(failure.fieldErrors))
    } finally {
      if (controller.current === request) { controller.current = null; setPending(false) }
    }
  }
  return <>
    {canEdit && <Button className="inventory-create-button" onClick={() => requestOpen(true)}><Plus aria-hidden="true" />{t('Ajouter du matériel')}</Button>}
    <Sheet open={open} onOpenChange={requestOpen}>
      <SheetContent className="asset-form-sheet" showCloseButton={false}
        onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById('asset-create-name')?.focus() }}
        onEscapeKeyDown={(event) => { if (pending || confirmClose) { event.preventDefault(); if (!pending) setConfirmClose(false) } }}
        onInteractOutside={(event) => { if (pending) event.preventDefault() }}>
        <SheetHeader><p className="eyebrow">{t('VOTRE PARC PREND FORME')}</p><SheetTitle>{t('Un nouvel équipement')}</SheetTitle><SheetDescription>{t('Enregistrez sa fiche dans l’inventaire partagé. Vous pourrez ensuite le localiser dans vos espaces.')}</SheetDescription></SheetHeader>
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={t('Fermer l’ajout de matériel')} disabled={pending} onClick={() => requestOpen(false)}><X aria-hidden="true" /></Button>
        <form className="asset-entry-form" noValidate onSubmit={(event) => { void submit(event) }}>
          <div className="asset-entry-scroll">
            <div className="asset-form-heading"><PackagePlus size={21} strokeWidth={1.5} aria-hidden="true" /><div><h3>{t('La fiche du matériel')}</h3><p>{t('Les champs marqués d’un astérisque sont obligatoires.')}</p></div></div>
            {!canEdit && <p className="asset-form-error" role="status">{t('Une session avec les droits d’édition est nécessaire pour enregistrer cette fiche. Votre saisie est conservée.')}</p>}
            <AssetFormFields prefix="asset-create" values={values} fields={fields} disabled={pending || confirmClose || !canEdit} onChange={update} />
            {error && <p className="asset-form-error" role="alert">{error}</p>}
            {confirmClose && <div className="asset-discard-confirm" role="alert"><h3>{t('Quitter sans enregistrer ?')}</h3><p>{t('La fiche en cours de saisie sera effacée.')}</p><div><Button type="button" variant="outline" ref={continueButton} onClick={() => setConfirmClose(false)}>{t('Continuer la saisie')}</Button><Button type="button" variant="ghost" onClick={close}>{t('Effacer et fermer')}</Button></div></div>}
          </div>
          <div className="asset-form-footer"><Button type="button" variant="outline" disabled={pending || confirmClose} onClick={() => requestOpen(false)}>{t('Annuler')}</Button><Button type="submit" disabled={pending || confirmClose || !canEdit}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{pending ? 'Enregistrement…' : t('Enregistrer le matériel')}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  </>
}
