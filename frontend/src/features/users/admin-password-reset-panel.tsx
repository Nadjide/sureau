import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { resetPasswordInputSchema, type AdminUser, type ResetPasswordInput } from './user-schema'

export type PasswordResetResult = { ok: true } | { ok: false; message: string; fieldErrors?: Readonly<Record<string, string>> }

interface Props {
  target: AdminUser
  canAdmin: boolean
  pending: boolean
  resetting: boolean
  unavailableReason: string | null
  uncertain: boolean
  onDirtyChange: (dirty: boolean) => void
  onReset: (target: AdminUser, input: ResetPasswordInput) => Promise<PasswordResetResult>
  onAcknowledgeUncertain: (target: AdminUser) => boolean
}

export function AdminPasswordResetPanel({ target, canAdmin, pending, resetting, unavailableReason, uncertain, onDirtyChange, onReset, onAcknowledgeUncertain }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [prepared, setPrepared] = useState<{ target: AdminUser; input: ResetPasswordInput } | null>(null)
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const latest = useRef({ target, canAdmin, pending, unavailableReason, uncertain, password, confirmation, prepared, onReset, onAcknowledgeUncertain })
  useLayoutEffect(() => {
    latest.current = { target, canAdmin, pending, unavailableReason, uncertain, password, confirmation, prepared, onReset, onAcknowledgeUncertain }
  }, [target, canAdmin, pending, unavailableReason, uncertain, password, confirmation, prepared, onReset, onAcknowledgeUncertain])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (expanded) document.getElementById('admin-reset-password')?.focus() }, [expanded])
  useEffect(() => { if (prepared) document.getElementById('admin-reset-confirm')?.focus() }, [prepared])

  function canPrepare() {
    const current = latest.current
    return mounted.current && current.canAdmin && !current.pending && !current.unavailableReason && !current.uncertain
  }
  function change(field: 'password' | 'confirmation', value: string) {
    if (!canPrepare() || latest.current.prepared) return
    if (field === 'password') setPassword(value)
    else setConfirmation(value)
    onDirtyChange(Boolean(field === 'password' ? value || latest.current.confirmation : value || latest.current.password))
    setFields((previous) => { const next = { ...previous }; delete next[field]; return next })
    setError(null)
  }
  function cancel() {
    if (latest.current.pending) return
    setPassword(''); setConfirmation(''); setPrepared(null); setFields({}); setError(null); setExpanded(false)
    onDirtyChange(false)
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = latest.current
    if (!canPrepare() || current.prepared) return
    const parsed = resetPasswordInputSchema.safeParse({ password: current.password })
    const errors: Record<string, string> = {}
    if (!parsed.success) for (const issue of parsed.error.issues) {
      if (typeof issue.path[0] === 'string' && !errors[issue.path[0]]) errors[issue.path[0]] = issue.message
    }
    if (current.confirmation !== current.password) errors.confirmation = t('Les deux mots de passe doivent être identiques.')
    setFields(errors); setError(null)
    if (!parsed.success || Object.keys(errors).length > 0) {
      document.getElementById(errors.password ? 'admin-reset-password' : 'admin-reset-confirmation')?.focus()
      return
    }
    setPrepared({ target: { ...current.target }, input: parsed.data })
  }
  async function confirm() {
    const current = latest.current
    if (!canPrepare() || !current.prepared || current.password !== current.prepared.input.password
      || current.confirmation !== current.prepared.input.password) return
    const result = await current.onReset(current.prepared.target, current.prepared.input)
    if (!mounted.current) return
    if (result.ok) {
      setPassword(''); setConfirmation(''); setPrepared(null); setFields({}); setError(null); setExpanded(false)
      onDirtyChange(false)
    } else {
      setPrepared(null); setError(result.message); setFields(result.fieldErrors ?? {})
    }
  }
  const disabled = !canAdmin || pending || unavailableReason !== null || uncertain

  return <section className="user-password-panel" aria-labelledby="admin-reset-title">
    <div className="user-form-heading"><KeyRound size={20} strokeWidth={1.4} aria-hidden="true" /><div><h3 id="admin-reset-title">{t('Le mot de passe de @{username}', { username: target.username })}</h3><p>{t('Définissez un nouveau mot de passe sans consulter l’ancien.')}</p></div></div>
    {unavailableReason && <p className="user-help">{unavailableReason}</p>}
    {uncertain && <div className="user-error" role="alert"><strong>{t('La réinitialisation n’a pas pu être confirmée.')}</strong><p>{t('Le mot de passe peut avoir changé et les sessions peuvent avoir été fermées. Actualiser la liste des comptes ne permet pas de vérifier ce résultat.')}</p><p>{t('Vérifiez manuellement l’accès à ce compte dans une autre fenêtre avec le nouveau mot de passe.')} {target.enabled ? t('Revenez ensuite confirmer cette vérification avant une nouvelle réinitialisation.') : t('Ce compte est désactivé : son accès reste bloqué jusqu’à sa réactivation.')}</p><Button type="button" variant="outline" disabled={!canAdmin || pending || unavailableReason !== null} onClick={() => {
      const current = latest.current
      if (!mounted.current || !current.canAdmin || current.pending || current.unavailableReason !== null || !current.uncertain) return
      if (current.onAcknowledgeUncertain(current.target)) { setError(null); setPrepared(null) }
    }}>{t('J’ai vérifié l’accès au compte')}</Button></div>}
    {!expanded ? <Button type="button" variant="outline" disabled={disabled} onClick={() => { if (canPrepare()) setExpanded(true) }}><KeyRound />{t('Réinitialiser le mot de passe')}</Button> : <form className="user-reset-form" noValidate onSubmit={prepare}>
      <fieldset disabled={disabled || prepared !== null}>
        <label htmlFor="admin-reset-password">{t('Nouveau mot de passe *')}<input id="admin-reset-password" name="password" type="password" value={password} maxLength={64} autoComplete="new-password" aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? 'admin-reset-password-error admin-reset-password-help' : 'admin-reset-password-help'} onChange={(event) => change('password', event.target.value)} />{fields.password && <small className="user-field-error" id="admin-reset-password-error">{fields.password}</small>}<small id="admin-reset-password-help">{t('12 à 64 caractères, au plus 72 octets en UTF-8. Les espaces saisis font partie du mot de passe.')}</small></label>
        <label htmlFor="admin-reset-confirmation">{t('Confirmer le nouveau mot de passe *')}<input id="admin-reset-confirmation" name="confirmation" type="password" value={confirmation} maxLength={64} autoComplete="new-password" aria-invalid={Boolean(fields.confirmation)} aria-describedby={fields.confirmation ? 'admin-reset-confirmation-error' : undefined} onChange={(event) => change('confirmation', event.target.value)} />{fields.confirmation && <small className="user-field-error" id="admin-reset-confirmation-error">{fields.confirmation}</small>}</label>
      </fieldset>
      <p className="user-help">{t('Annuler la réinitialisation efface les deux champs. Le mot de passe n’est pas conservé après une réinitialisation confirmée.')}</p>
      {error && !uncertain && <p className="user-error" role="alert">{error}</p>}
      {prepared && <div className="user-confirm" role="alert"><h3>{t('Réinitialiser le mot de passe de @{username} ?', { username: prepared.target.username })}</h3><p>{t('Toutes les sessions ouvertes de ce compte seront révoquées. Cette personne devra se reconnecter avec le nouveau mot de passe.')}</p>{!prepared.target.enabled && <p>{t('Ce compte restera désactivé. Cette réinitialisation ne réactive pas son accès.')}</p>}<p>{t('Si vous réinitialisez votre propre compte, vous devrez aussi vous reconnecter pour reprendre votre travail.')}</p><div><Button type="button" variant="outline" disabled={pending} onClick={() => { if (!latest.current.pending) setPrepared(null) }}>{t('Revenir aux mots de passe')}</Button><Button id="admin-reset-confirm" type="button" disabled={disabled} onClick={() => { void confirm() }}>{resetting && <LoaderCircle className="animate-spin" />}{t('Confirmer la réinitialisation')}</Button></div></div>}
      <div className="user-form-actions"><Button type="button" variant="outline" disabled={pending} onClick={cancel}>{t('Annuler la réinitialisation')}</Button>{!prepared && <Button type="submit" disabled={disabled}>{t('Préparer la réinitialisation')}</Button>}</div>
    </form>}
  </section>
}
