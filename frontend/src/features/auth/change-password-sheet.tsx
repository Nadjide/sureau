import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Check, KeyRound, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { changeOwnPasswordInputSchema } from '@/features/users/user-schema'
import { usersApi } from '@/features/users/users-api'
import { ApiError } from '@/lib/api-client'
import { useSession } from './use-session'
import './auth.css'

interface Props { open: boolean; onOpenChange: (open: boolean) => void }
interface Values { currentPassword: string; newPassword: string; confirmation: string }
interface Operation { controller: AbortController; userId: number }
interface Verification { userId: number; sawExpired: boolean }
const emptyValues: Values = { currentPassword: '', newPassword: '', confirmation: '' }
const inputIds: Record<keyof Values, string> = {
  currentPassword: 'own-password-current', newPassword: 'own-password-new', confirmation: 'own-password-confirmation',
}

export function ChangePasswordSheet({ open, onOpenChange }: Props) {
  const session = useSession()
  const [ownerId] = useState(() => session.state.user?.id ?? null)
  const [values, setValues] = useState<Values>(() => ({ ...emptyValues }))
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [verificationRequested, setVerificationRequested] = useState(false)
  const operation = useRef<Operation | null>(null)
  const verification = useRef<Verification | null>(null)
  const mounted = useRef(false)
  const latest = useRef({ open, session, values, discard, uncertain })
  useLayoutEffect(() => { latest.current = { open, session, values, discard, uncertain } }, [open, session, values, discard, uncertain])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; operation.current?.controller.abort(); operation.current = null }
  }, [])
  useLayoutEffect(() => {
    const requested = verification.current
    if (!requested || session.state.user?.id !== requested.userId) return
    if (session.state.phase === 'expired') requested.sawExpired = true
    else if (session.state.phase === 'authenticated' && requested.sawExpired) {
      verification.current = null
      setVerificationRequested(false); setUncertain(false); setValues({ ...emptyValues }); setFields({}); setError(null); setDiscard(false)
      setNotice('Connexion vérifiée. Vous pouvez reprendre votre travail. Cette vérification ne confirme pas que le mot de passe a été modifié.')
    }
  }, [session.state.phase, session.state.user?.id])

  const dirty = Object.values(values).some((value) => value.length > 0)
  const authenticated = session.state.phase === 'authenticated' && session.state.user.id === ownerId
  useEffect(() => {
    if (!open || (!dirty && !pending)) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [open, dirty, pending])

  function canWrite() {
    const current = latest.current
    return mounted.current && current.open && !operation.current && !current.session.busy && !current.discard && !current.uncertain
      && current.session.state.phase === 'authenticated' && current.session.state.user.id === ownerId
  }
  function change(field: keyof Values, value: string) {
    if (!canWrite()) return
    setValues((previous) => ({ ...previous, [field]: value }))
    setFields((previous) => { const next = { ...previous }; delete next[field]; return next })
    setError(null); setNotice(null)
  }
  function clearSecrets() {
    setValues({ ...emptyValues }); setFields({}); setError(null); setDiscard(false)
  }
  function requestClose() {
    if (operation.current) return
    if (Object.values(latest.current.values).some((value) => value.length > 0)) setDiscard(true)
    else { setDiscard(false); onOpenChange(false) }
  }
  function discardAndClose() {
    if (operation.current || !latest.current.discard) return
    clearSecrets(); setNotice(null); onOpenChange(false)
  }
  function reportInvalid(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>) {
    const errors: Record<string, string> = {}
    for (const issue of issues) if (typeof issue.path[0] === 'string' && !errors[issue.path[0]]) errors[issue.path[0]] = issue.message
    setFields(errors); setError('Vérifiez les champs indiqués avant de modifier votre mot de passe.')
    const first = Object.keys(errors)[0] as keyof Values | undefined
    if (first) document.getElementById(inputIds[first])?.focus()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = latest.current
    if (!canWrite() || current.session.state.phase !== 'authenticated') return
    const { confirmation, ...input } = current.values
    const parsed = changeOwnPasswordInputSchema.safeParse(input)
    if (!parsed.success) { reportInvalid(parsed.error.issues); return }
    if (confirmation !== input.newPassword) { reportInvalid([{ path: ['confirmation'], message: 'Les deux nouveaux mots de passe doivent être identiques.' }]); return }
    const request: Operation = { controller: new AbortController(), userId: current.session.state.user.id }
    operation.current = request; setPending(true); setFields({}); setError(null); setNotice(null)
    try {
      await usersApi.changeOwnPassword(parsed.data, request.controller.signal)
      if (!mounted.current || operation.current !== request || request.controller.signal.aborted
        || latest.current.session.state.user?.id !== request.userId) return
      clearSecrets(); setUncertain(false); setVerificationRequested(false); verification.current = null
      setNotice('Le changement de votre mot de passe a été confirmé. Reconnectez-vous pour reprendre votre travail.')
      latest.current.session.expire('Votre mot de passe a été modifié. Reconnectez-vous avec le nouveau mot de passe pour reprendre votre travail.')
    } catch (failure) {
      if (!mounted.current || operation.current !== request || request.controller.signal.aborted
        || latest.current.session.state.user?.id !== request.userId) return
      const message = failure instanceof Error ? failure.message : 'Le changement du mot de passe n’a pas pu être confirmé.'
      if (!(failure instanceof ApiError) || failure.kind !== 'http' || (failure.status !== null && failure.status >= 500)) setUncertain(true)
      if (failure instanceof ApiError) {
        setFields(failure.code === 'CURRENT_PASSWORD_INVALID' ? { ...failure.fieldErrors, currentPassword: message } : failure.fieldErrors)
        if (failure.code === 'CURRENT_PASSWORD_INVALID' && latest.current.session.state.phase === 'authenticated') document.getElementById(inputIds.currentPassword)?.focus()
      }
      setError(message)
    } finally {
      if (operation.current === request) { operation.current = null; if (mounted.current) setPending(false) }
    }
  }
  function verifyConnection() {
    const current = latest.current
    if (!mounted.current || !current.open || operation.current || current.session.busy || current.discard || !current.uncertain
      || current.session.state.phase !== 'authenticated' || current.session.state.user.id !== ownerId || verification.current) return
    verification.current = { userId: current.session.state.user.id, sawExpired: false }
    setVerificationRequested(true)
    current.session.expire('Vérifiez votre connexion en essayant le nouveau mot de passe. S’il ne fonctionne pas, essayez votre ancien mot de passe. Vos champs seront effacés après une reconnexion réussie à ce même compte ; votre brouillon Sureau restera ouvert.')
  }
  const disabled = !authenticated || session.busy || pending || uncertain || discard
  const fieldError = (name: keyof Values) => fields[name] ? <small className="auth-field-error" id={`${inputIds[name]}-error`}>{fields[name]}</small> : null
  const described = (name: keyof Values) => fields[name] ? `${inputIds[name]}-error` : undefined

  return <Sheet open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
    <SheetContent className="change-password-sheet" showCloseButton={false}
      onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById(uncertain ? 'own-password-verify' : inputIds.currentPassword)?.focus() }}
      onEscapeKeyDown={(event) => { if (operation.current || discard) event.preventDefault() }}
      onInteractOutside={(event) => { if (operation.current) event.preventDefault() }}>
      <SheetHeader><p className="eyebrow">VOTRE ACCÈS À SUREAU</p><SheetTitle>Changer mon mot de passe</SheetTitle><SheetDescription>Le mot de passe de votre compte @{session.state.user?.username}.</SheetDescription></SheetHeader>
      <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" disabled={pending} aria-label="Fermer le changement de mot de passe" onClick={requestClose}><X aria-hidden="true" /></Button>
      <div className="change-password-scroll">
        <div className="change-password-intro"><span><KeyRound size={22} strokeWidth={1.4} aria-hidden="true" /></span><p>Choisissez un nouveau mot de passe pour votre compte. Vos droits d’accès restent les mêmes.</p></div>
        {!authenticated && <p className="change-password-note" role="status">Votre saisie est conservée. Reconnectez-vous au même compte avant de reprendre ce changement.</p>}
        {notice && <p className="change-password-success" role="status"><Check size={16} aria-hidden="true" />{notice}</p>}
        {uncertain && <div className="auth-error" role="alert"><strong>Le résultat du changement est incertain.</strong><p>Votre mot de passe peut avoir changé et vos sessions peuvent avoir été fermées. Une nouvelle tentative est bloquée jusqu’à la vérification de votre connexion.</p><p>Essayez de vous reconnecter avec le nouveau mot de passe ; s’il ne fonctionne pas, utilisez l’ancien. Les champs de ce formulaire seront effacés après une connexion réussie au même compte. Votre brouillon Sureau restera ouvert.</p><Button id="own-password-verify" variant="outline" disabled={!authenticated || session.busy || pending || discard || verificationRequested} onClick={verifyConnection}>{verificationRequested ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}Vérifier ma connexion</Button></div>}
        <form className="auth-form change-password-form" noValidate onSubmit={(event) => { void submit(event) }}>
          <fieldset disabled={disabled}>
            <label htmlFor={inputIds.currentPassword}>Mot de passe actuel *<input id={inputIds.currentPassword} name="currentPassword" type="password" value={values.currentPassword} maxLength={64} autoComplete="current-password" aria-invalid={Boolean(fields.currentPassword)} aria-describedby={described('currentPassword')} onChange={(event) => change('currentPassword', event.target.value)} />{fieldError('currentPassword')}</label>
            <label htmlFor={inputIds.newPassword}>Nouveau mot de passe *<input id={inputIds.newPassword} name="newPassword" type="password" value={values.newPassword} maxLength={64} autoComplete="new-password" aria-invalid={Boolean(fields.newPassword)} aria-describedby={fields.newPassword ? `${inputIds.newPassword}-error own-password-help` : 'own-password-help'} onChange={(event) => change('newPassword', event.target.value)} />{fieldError('newPassword')}<small id="own-password-help">12 à 64 caractères, au plus 72 octets en UTF-8. Les espaces saisis font partie du mot de passe.</small></label>
            <label htmlFor={inputIds.confirmation}>Confirmer le nouveau mot de passe *<input id={inputIds.confirmation} name="confirmation" type="password" value={values.confirmation} maxLength={64} autoComplete="new-password" aria-invalid={Boolean(fields.confirmation)} aria-describedby={described('confirmation')} onChange={(event) => change('confirmation', event.target.value)} />{fieldError('confirmation')}</label>
          </fieldset>
          <p className="change-password-impact">En modifiant votre mot de passe, vous fermez toutes les sessions ouvertes de votre compte, y compris celle-ci. Vous devrez vous reconnecter avec le nouveau mot de passe. Votre brouillon Sureau restera ouvert.</p>
          {error && !uncertain && <p className="auth-error" role="alert">{error}</p>}
          <div className="change-password-actions"><Button type="button" variant="outline" disabled={pending} onClick={requestClose}>Annuler</Button><Button type="submit" disabled={disabled}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}Modifier mon mot de passe</Button></div>
        </form>
        {discard && <div className="change-password-discard" role="alert"><h3>Effacer les mots de passe saisis ?</h3><p>Les trois champs seront vidés avant de fermer ce panneau. Aucun mot de passe saisi n’est conservé hors de cette page.</p><div><Button variant="outline" disabled={pending} onClick={() => { if (!operation.current) setDiscard(false) }}>Conserver ma saisie</Button><Button variant="ghost" disabled={pending} onClick={discardAndClose}>Effacer et fermer</Button></div></div>}
      </div>
    </SheetContent>
  </Sheet>
}
