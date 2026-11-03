import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useSession } from '@/features/auth/use-session'
import { roleLabels } from '@/features/auth/session-state'
import { ApiError } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import {
  createUserInputSchema,
  resetPasswordInputSchema,
  sameEmail,
  updateUserInputSchema,
  type AdminUser,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from './user-schema'
import { usersApi } from './users-api'
import { AdminPasswordResetPanel, type PasswordResetResult } from './admin-password-reset-panel'
import './users.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}
type CreateValues = CreateUserInput & { confirmation: string }
type UserForm = { kind: 'create'; values: CreateValues } | { kind: 'edit'; base: AdminUser; values: UpdateUserInput }
type Destination = 'close' | 'list' | 'create' | AdminUser
type SecurityConfirmation = { base: AdminUser; values: UpdateUserInput }
type Request = { controller: AbortController; kind: 'list' | 'create' | 'update' | 'reset' }
const emptyCreate: CreateValues = {
  username: '',
  displayName: '',
  password: '',
  confirmation: '',
  role: 'VIEWER',
  email: null,
}
const editValues = (user: AdminUser): UpdateUserInput => ({
  displayName: user.displayName,
  role: user.role,
  enabled: user.enabled,
  email: user.email,
})
const sameAccount = (first: AdminUser, second: AdminUser) =>
  first.id === second.id &&
  first.username === second.username &&
  first.displayName === second.displayName &&
  first.role === second.role &&
  first.enabled === second.enabled &&
  first.email === second.email
const sameValues = (first: UpdateUserInput, second: UpdateUserInput) =>
  first.displayName === second.displayName &&
  first.role === second.role &&
  first.enabled === second.enabled &&
  (first.email ?? '').trim() === (second.email ?? '').trim()
const formIdentity = (form: UserForm | null) =>
  form?.kind === 'create' ? 'create' : form?.kind === 'edit' ? `edit:${form.base.id}` : null
const accountFormDirty = (form: UserForm | null) =>
  form !== null &&
  (form.kind === 'create'
    ? JSON.stringify(form.values) !== JSON.stringify(emptyCreate)
    : !sameValues(form.values, editValues(form.base)))
const mergeAccount = (previous: AdminUser[] | null, account: AdminUser) =>
  [...(previous ?? []).filter((user) => user.id !== account.id), account].sort((a, b) =>
    a.username.localeCompare(b.username),
  )

export function UserManagementSheet({ open, onOpenChange }: Props) {
  const session = useSession()
  const { canAdmin, state } = session
  const [accounts, setAccounts] = useState<AdminUser[] | null>(null)
  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [listError, setListError] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm | null>(null)
  const [pending, setPending] = useState<Request['kind'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [discard, setDiscard] = useState<Destination | null>(null)
  const [securityConfirmation, setSecurityConfirmation] = useState<SecurityConfirmation | null>(null)
  const [resetDirty, setResetDirty] = useState(false)
  const [resetGeneration, setResetGeneration] = useState(0)
  const [passwordUncertain, setPasswordUncertain] = useState<ReadonlySet<number>>(() => new Set())
  const request = useRef<Request | null>(null)
  const mounted = useRef(false)
  const focusRequested = useRef<string | null>(null)
  const latest = useRef({
    canAdmin,
    userId: state.user?.id,
    accounts,
    form,
    listStatus,
    blocked,
    discard,
    securityConfirmation,
    session,
    resetDirty,
    passwordUncertain,
  })
  useLayoutEffect(() => {
    latest.current = {
      canAdmin,
      userId: state.user?.id,
      accounts,
      form,
      listStatus,
      blocked,
      discard,
      securityConfirmation,
      session,
      resetDirty,
      passwordUncertain,
    }
  }, [
    canAdmin,
    state.user?.id,
    accounts,
    form,
    listStatus,
    blocked,
    discard,
    securityConfirmation,
    session,
    resetDirty,
    passwordUncertain,
  ])

  const accountDirty = accountFormDirty(form)
  const dirty = accountDirty || resetDirty
  const currentTarget = form?.kind === 'edit' ? accounts?.find((account) => account.id === form.base.id) : undefined
  const targetChanged = form?.kind === 'edit' && (!currentTarget || !sameAccount(currentTarget, form.base))
  const lastAdministrator =
    form?.kind === 'edit' &&
    form.base.enabled &&
    form.base.role === 'ADMIN' &&
    accounts?.filter((account) => account.enabled && account.role === 'ADMIN').length === 1
  // The address decides which enterprise identity opens the account: changing it closes its sessions too.
  const securityChange =
    form?.kind === 'edit' &&
    (form.values.role !== form.base.role ||
      form.values.enabled !== form.base.enabled ||
      !sameEmail(form.values.email, form.base.email))
  const formKey = formIdentity(form)

  useEffect(() => {
    if (formKey === null || focusRequested.current !== formKey) return
    focusRequested.current = null
    document.getElementById(formKey === 'create' ? 'user-create-username' : 'user-edit-displayName')?.focus()
  }, [formKey, resetGeneration])

  const loadAccounts = useCallback(async () => {
    if (!mounted.current || !latest.current.canAdmin || request.current) return
    const operation: Request = { controller: new AbortController(), kind: 'list' }
    request.current = operation
    setPending('list')
    setListStatus('loading')
    setListError(null)
    try {
      const users = await usersApi.list(operation.controller.signal)
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation) return
      setAccounts(users)
      setListStatus('ready')
      setBlocked(false)
      setError(null)
      setNotice(t('Liste des comptes actualisée. Les saisies en cours sont conservées.'))
    } catch (failure) {
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation) return
      setListStatus('error')
      setListError(failure instanceof Error ? failure.message : t('Les comptes n’ont pas pu être chargés.'))
    } finally {
      if (request.current === operation) {
        request.current = null
        if (mounted.current) setPending(null)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.controller.abort()
      request.current = null
    }
  }, [])
  useEffect(() => {
    if (open && latest.current.canAdmin) void loadAccounts()
  }, [open, loadAccounts])
  useEffect(() => {
    if (!open || (!dirty && !pending)) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [open, dirty, pending])

  function navigate(destination: Destination) {
    setDiscard(null)
    setSecurityConfirmation(null)
    setFields({})
    setError(null)
    setNotice(null)
    setResetDirty(false)
    setResetGeneration((previous) => previous + 1)
    if (destination === 'close' || destination === 'list') {
      focusRequested.current = null
      setForm(null)
      if (destination === 'close') onOpenChange(false)
    } else {
      const next: UserForm =
        destination === 'create'
          ? { kind: 'create', values: { ...emptyCreate } }
          : { kind: 'edit', base: destination, values: editValues(destination) }
      focusRequested.current = formIdentity(next)
      setForm(next)
    }
  }
  function requestNavigate(destination: Destination) {
    if (request.current?.kind === 'list' && destination === 'close') {
      request.current.controller.abort()
      request.current = null
      setPending(null)
      setListStatus(latest.current.accounts === null ? 'idle' : 'error')
      setListError(
        t(
          'L’actualisation a été interrompue. Actualisez les comptes avant un nouvel enregistrement. Votre saisie est conservée.',
        ),
      )
    } else if (request.current) return
    if (destination === 'close' && latest.current.session.state.phase === 'authenticated' && !latest.current.canAdmin) {
      navigate('close')
      return
    }
    if (destination !== 'close' && destination !== 'list' && !latest.current.canAdmin) return
    if (dirty) {
      setDiscard(destination)
      setSecurityConfirmation(null)
      return
    }
    navigate(destination)
  }
  function clearField(field: string) {
    setFields((previous) => {
      const next = { ...previous }
      delete next[field]
      return next
    })
    setSecurityConfirmation(null)
  }
  function changeCreate(field: keyof CreateValues, value: string) {
    if (!latest.current.canAdmin || request.current || latest.current.discard !== null) return
    const next = field === 'email' && value === '' ? null : value
    setForm((previous) =>
      previous?.kind === 'create' ? { ...previous, values: { ...previous.values, [field]: next } } : previous,
    )
    clearField(field)
  }
  function changeEdit(field: keyof UpdateUserInput, value: string | boolean) {
    const current = latest.current
    if (
      !current.canAdmin ||
      request.current ||
      current.discard !== null ||
      current.resetDirty ||
      current.form?.kind !== 'edit'
    )
      return
    if (field === 'enabled' && value === false && current.form.base.id === current.userId) return
    const next = field === 'email' && value === '' ? null : value
    setForm((previous) =>
      previous?.kind === 'edit' ? { ...previous, values: { ...previous.values, [field]: next } } : previous,
    )
    clearField(field)
  }
  function invalid(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>) {
    const errors: Record<string, string> = {}
    for (const issue of issues)
      if (typeof issue.path[0] === 'string' && !errors[issue.path[0]]) errors[issue.path[0]] = issue.message
    setFields(errors)
    setError(t('Vérifiez les champs indiqués avant d’enregistrer le compte.'))
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(`user-${form?.kind ?? 'create'}-${first}`)?.focus()
  }
  function fail(failure: unknown) {
    if (failure instanceof ApiError) {
      setFields(failure.fieldErrors)
      if (failure.kind !== 'http' || (failure.status !== null && failure.status >= 500)) setBlocked(true)
    }
    if (failure instanceof ApiError && failure.code === 'DUPLICATE_RESOURCE') {
      setError(
        t('Cet identifiant ou cette adresse e-mail est déjà utilisé par un autre compte. Votre saisie est conservée.'),
      )
      return
    }
    setError(failure instanceof Error ? failure.message : t('La modification du compte n’a pas pu être confirmée.'))
  }
  function canSubmit() {
    const current = latest.current
    return (
      mounted.current &&
      current.canAdmin &&
      !request.current &&
      !current.blocked &&
      !current.resetDirty &&
      current.listStatus === 'ready' &&
      current.discard === null
    )
  }
  async function createAccount(input: CreateUserInput) {
    if (!canSubmit() || latest.current.form?.kind !== 'create') return
    const operation: Request = { controller: new AbortController(), kind: 'create' }
    request.current = operation
    setPending('create')
    setError(null)
    setFields({})
    try {
      const account = await usersApi.create(input, operation.controller.signal)
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation) return
      setAccounts((previous) => mergeAccount(previous, account))
      setForm({ kind: 'edit', base: account, values: editValues(account) })
      setResetDirty(false)
      setResetGeneration((previous) => previous + 1)
      setNotice(
        t('Le compte @{username} est créé. Son mot de passe initial n’est pas conservé dans cette saisie.', {
          username: account.username,
        }),
      )
    } catch (failure) {
      if (mounted.current && !operation.controller.signal.aborted && request.current === operation) fail(failure)
    } finally {
      if (request.current === operation) {
        request.current = null
        if (mounted.current) setPending(null)
      }
    }
  }
  async function updateAccount(base: AdminUser, values: UpdateUserInput) {
    const current = latest.current
    if (!canSubmit() || current.form?.kind !== 'edit' || current.form.base.id !== base.id) return
    const target = current.accounts?.find((account) => account.id === base.id)
    const parsed = updateUserInputSchema.safeParse(current.form.values)
    if (
      !target ||
      !sameAccount(target, base) ||
      !sameAccount(current.form.base, base) ||
      !parsed.success ||
      !sameValues(parsed.data, values)
    ) {
      setSecurityConfirmation(null)
      setError(t('Le compte ou votre saisie a changé. Reprenez les informations actualisées avant de confirmer.'))
      return
    }
    if (base.id === current.userId && !values.enabled) {
      setError(t('Votre compte ne peut pas être désactivé depuis cette saisie.'))
      return
    }
    const removesAdministrator = base.enabled && base.role === 'ADMIN' && (!values.enabled || values.role !== 'ADMIN')
    if (
      removesAdministrator &&
      current.accounts?.filter((account) => account.enabled && account.role === 'ADMIN').length === 1
    ) {
      setError(
        t(
          'Un administrateur actif doit rester disponible. Ajoutez ou activez un autre administrateur avant cette modification.',
        ),
      )
      return
    }
    const operation: Request = { controller: new AbortController(), kind: 'update' }
    request.current = operation
    setPending('update')
    setError(null)
    setFields({})
    try {
      const account = await usersApi.update(base.id, values, operation.controller.signal)
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation) return
      setAccounts((previous) => mergeAccount(previous, account))
      setForm({ kind: 'edit', base: account, values: editValues(account) })
      setSecurityConfirmation(null)
      setNotice(t('Les informations de @{username} sont enregistrées.', { username: account.username }))
      if (account.id === current.userId) {
        if (base.role !== account.role || base.enabled !== account.enabled || !sameEmail(base.email, account.email))
          current.session.expire()
        else current.session.updateUser({ id: account.id, displayName: account.displayName })
      }
    } catch (failure) {
      if (mounted.current && !operation.controller.signal.aborted && request.current === operation) fail(failure)
    } finally {
      if (request.current === operation) {
        request.current = null
        if (mounted.current) setPending(null)
      }
    }
  }
  async function resetPassword(base: AdminUser, input: ResetPasswordInput): Promise<PasswordResetResult> {
    const current = latest.current
    const rejected = (message: string): PasswordResetResult => ({ ok: false, message })
    if (
      !mounted.current ||
      !current.canAdmin ||
      request.current ||
      current.blocked ||
      current.listStatus !== 'ready' ||
      current.discard !== null ||
      current.securityConfirmation !== null ||
      current.passwordUncertain.has(base.id)
    ) {
      return rejected(
        t(
          'La réinitialisation est indisponible. Vérifiez votre session et les informations du compte avant de confirmer.',
        ),
      )
    }
    const target = current.accounts?.find((account) => account.id === base.id)
    if (
      current.form?.kind !== 'edit' ||
      current.form.base.id !== base.id ||
      accountFormDirty(current.form) ||
      !target ||
      !sameAccount(target, base) ||
      !sameAccount(current.form.base, base)
    ) {
      return rejected(
        t('Le compte ou votre saisie a changé. Reprenez sa fiche actualisée avant de réinitialiser son mot de passe.'),
      )
    }
    const parsed = resetPasswordInputSchema.safeParse(input)
    if (!parsed.success) return rejected(t('Le nouveau mot de passe ne respecte pas les règles indiquées.'))
    const operation: Request = { controller: new AbortController(), kind: 'reset' }
    request.current = operation
    setPending('reset')
    setError(null)
    setNotice(null)
    try {
      await usersApi.resetPassword(base.id, parsed.data, operation.controller.signal)
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation)
        return rejected(t('La réinitialisation a été interrompue.'))
      setResetDirty(false)
      setResetGeneration((previous) => previous + 1)
      setNotice(
        base.enabled
          ? t('Le mot de passe de @{username} est réinitialisé. Toutes ses sessions ont été fermées.', {
              username: base.username,
            })
          : t(
              'Le mot de passe de @{username} est réinitialisé. Toutes ses sessions ont été fermées ; son compte reste désactivé.',
              { username: base.username },
            ),
      )
      if (base.id === current.userId)
        current.session.expire(
          t(
            'Votre mot de passe a été réinitialisé. Reconnectez-vous avec le nouveau mot de passe pour reprendre votre travail.',
          ),
        )
      return { ok: true }
    } catch (failure) {
      if (!mounted.current || operation.controller.signal.aborted || request.current !== operation)
        return rejected(t('La réinitialisation a été interrompue.'))
      if (
        !(failure instanceof ApiError) ||
        failure.kind !== 'http' ||
        (failure.status !== null && failure.status >= 500)
      ) {
        setPasswordUncertain((previous) => new Set(previous).add(base.id))
      }
      return {
        ok: false,
        message:
          failure instanceof Error
            ? failure.message
            : t('La réinitialisation du mot de passe n’a pas pu être confirmée.'),
        ...(failure instanceof ApiError ? { fieldErrors: failure.fieldErrors } : {}),
      }
    } finally {
      if (request.current === operation) {
        request.current = null
        if (mounted.current) setPending(null)
      }
    }
  }
  function acknowledgePassword(base: AdminUser) {
    const current = latest.current
    if (
      !mounted.current ||
      !current.canAdmin ||
      request.current ||
      current.listStatus !== 'ready' ||
      current.discard !== null ||
      current.securityConfirmation !== null ||
      current.form?.kind !== 'edit' ||
      !current.passwordUncertain.has(base.id) ||
      !sameAccount(current.form.base, base)
    )
      return false
    const target = current.accounts?.find((account) => account.id === base.id)
    if (!target || !sameAccount(target, base)) return false
    setPasswordUncertain((previous) => {
      const next = new Set(previous)
      next.delete(base.id)
      return next
    })
    setNotice(
      t(
        'Vous avez confirmé la vérification de l’accès à @{username}. Une nouvelle réinitialisation peut être préparée si nécessaire.',
        { username: base.username },
      ),
    )
    return true
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit() || !form || latest.current.securityConfirmation) return
    setFields({})
    setError(null)
    if (form.kind === 'create') {
      const { confirmation, ...input } = form.values
      const parsed = createUserInputSchema.safeParse(input)
      if (!parsed.success) {
        invalid(parsed.error.issues)
        return
      }
      if (confirmation !== input.password) {
        invalid([{ path: ['confirmation'], message: t('Les deux mots de passe doivent être identiques.') }])
        return
      }
      void createAccount(parsed.data)
    } else {
      const parsed = updateUserInputSchema.safeParse(form.values)
      if (!parsed.success) {
        invalid(parsed.error.issues)
        return
      }
      if (targetChanged) {
        setError(t('Ce compte a changé sur le serveur. Reprenez sa fiche actualisée avant de l’enregistrer.'))
        return
      }
      if (securityChange) setSecurityConfirmation({ base: form.base, values: parsed.data })
      else void updateAccount(form.base, parsed.data)
    }
  }
  const inputDisabled = !canAdmin || Boolean(pending) || discard !== null || securityConfirmation !== null || resetDirty
  const submitDisabled =
    inputDisabled || blocked || listStatus !== 'ready' || (form?.kind === 'edit' && (!accountDirty || targetChanged))
  const prefix = `user-${form?.kind ?? 'create'}`
  const restricted = state.phase === 'authenticated' && !canAdmin
  const mutating = pending === 'create' || pending === 'update' || pending === 'reset'
  const resetUnavailableReason =
    discard !== null || securityConfirmation !== null
      ? t('Terminez la confirmation en cours avant de réinitialiser ce mot de passe.')
      : accountDirty
        ? t('Enregistrez ou annulez d’abord les modifications des informations du compte.')
        : targetChanged
          ? t('Reprenez les informations actualisées de ce compte avant de réinitialiser son mot de passe.')
          : blocked
            ? t('Vérifiez d’abord le résultat de la modification du compte en actualisant la liste.')
            : listStatus !== 'ready'
              ? t('Actualisez les comptes avant de réinitialiser ce mot de passe.')
              : null
  const fieldError = (name: string) =>
    fields[name] ? (
      <small className="user-field-error" id={`${prefix}-${name}-error`}>
        {fields[name]}
      </small>
    ) : null
  const described = (name: string) => (fields[name] ? `${prefix}-${name}-error` : undefined)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestNavigate('close')
      }}
    >
      <SheetContent
        className="user-management-sheet"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (mutating || (pending !== 'list' && !restricted && (discard !== null || securityConfirmation)))
            event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (mutating) event.preventDefault()
        }}
      >
        <SheetHeader>
          <p className="eyebrow">{t('LES PERSONNES DERRIÈRE LE PARC')}</p>
          <SheetTitle>{t('Gérer l’équipe')}</SheetTitle>
          <SheetDescription>{t('Les comptes et les droits d’accès à votre instance Sureau.')}</SheetDescription>
        </SheetHeader>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3"
          disabled={mutating}
          aria-label={t('Fermer la gestion de l’équipe')}
          onClick={() => requestNavigate('close')}
        >
          <X aria-hidden="true" />
        </Button>
        {restricted ? (
          <div className="user-management-scroll">
            <p className="user-notice" role="status">
              {t(
                'Votre session ne dispose plus des droits administrateur. La gestion de l’équipe est fermée à ce compte ; vos espaces et votre travail restent ouverts.',
              )}
            </p>
            <Button variant="outline" disabled={mutating} onClick={() => requestNavigate('close')}>
              {t('Fermer la gestion de l’équipe')}
            </Button>
          </div>
        ) : (
          <div className="user-management-scroll">
            {!canAdmin && (
              <p className="user-notice" role="status">
                {t(
                  'Les droits administrateur sont nécessaires pour modifier les comptes. Vos informations et vos saisies restent affichées.',
                )}
              </p>
            )}
            <div className="user-list-toolbar">
              <div>
                <Users size={19} aria-hidden="true" />
                <h3>{t('Les comptes de l’instance')}</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canAdmin || Boolean(pending)}
                onClick={() => {
                  void loadAccounts()
                }}
              >
                <RefreshCw />
                {t('Actualiser les comptes')}
              </Button>
            </div>
            {listStatus === 'loading' && (
              <p className="user-loading" role="status">
                <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                {t('Chargement des comptes…')}
              </p>
            )}
            {listError && (
              <div className="user-error" role="alert">
                <p>{listError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canAdmin || Boolean(pending)}
                  onClick={() => {
                    void loadAccounts()
                  }}
                >
                  {t('Réessayer le chargement des comptes')}
                </Button>
              </div>
            )}
            {listStatus === 'idle' && (
              <p className="user-notice">
                {t('Utilisez « Actualiser les comptes » pour charger la liste avec une session administrateur.')}
              </p>
            )}
            {accounts !== null && (
              <ul className="user-account-list" aria-label={t('Comptes de l’instance')}>
                {accounts.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      className={form?.kind === 'edit' && form.base.id === account.id ? 'is-current' : ''}
                      disabled={!canAdmin || Boolean(pending)}
                      aria-pressed={form?.kind === 'edit' && form.base.id === account.id}
                      onClick={() => requestNavigate(account)}
                    >
                      <span className="user-account-icon">
                        <UserRound size={18} aria-hidden="true" />
                      </span>
                      <span className="user-account-copy">
                        <strong>
                          {account.displayName}
                          {account.id === state.user?.id && (
                            <>
                              {' '}
                              <small>{t('Vous')}</small>
                            </>
                          )}
                        </strong>
                        <span>
                          @{account.username} · {t(roleLabels[account.role])}
                          {account.email && <> · {account.email}</>}
                        </span>
                      </span>
                      <span className={`user-access-badge${account.enabled ? '' : ' is-disabled'}`}>
                        {account.enabled ? t('Actif') : t('Désactivé')}
                      </span>
                      <span className="sr-only">, {t('modifier ce compte')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {listStatus === 'ready' && accounts?.length === 0 && (
              <p className="user-notice">{t('Aucun compte n’a été renvoyé par cette instance.')}</p>
            )}
            {canAdmin && (
              <Button
                variant="outline"
                className="user-create-button"
                disabled={Boolean(pending) || accounts === null || listStatus !== 'ready'}
                onClick={() => requestNavigate('create')}
              >
                <Plus />
                {t('Créer un compte')}
              </Button>
            )}
            {notice && (
              <p className="user-success" role="status">
                <Check size={14} aria-hidden="true" />
                {notice}
              </p>
            )}
            {blocked && (
              <p className="user-error" role="alert">
                {t(
                  'Le résultat de la dernière modification doit être vérifié. Actualisez explicitement les comptes avant une nouvelle tentative. Votre saisie est conservée.',
                )}
              </p>
            )}
            {form && (
              <form className="user-entry-form" noValidate onSubmit={submit}>
                <div className="user-form-heading">
                  <ShieldCheck size={20} strokeWidth={1.4} aria-hidden="true" />
                  <div>
                    <h3>
                      {form.kind === 'create'
                        ? t('Un nouveau compte')
                        : t('Le compte @{username}', { username: form.base.username })}
                    </h3>
                    <p>
                      {form.kind === 'create'
                        ? t('Choisissez les accès de cette personne et son mot de passe initial.')
                        : t('L’identifiant du compte reste le même.')}
                    </p>
                  </div>
                </div>
                {targetChanged && (
                  <div className="user-error" role="alert">
                    <p>
                      {currentTarget
                        ? t('Ce compte a changé depuis l’ouverture de cette fiche. Votre saisie est conservée.')
                        : t('Ce compte ne figure plus dans la liste actualisée. Votre saisie est conservée.')}
                    </p>
                    {currentTarget && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(pending) || !canAdmin}
                        onClick={() => requestNavigate(currentTarget)}
                      >
                        {t('Reprendre les informations actualisées')}
                      </Button>
                    )}
                  </div>
                )}
                {resetDirty && (
                  <p className="user-help">
                    {t(
                      'Une réinitialisation de mot de passe est en cours de saisie. Terminez-la ou annulez-la pour modifier les informations de ce compte.',
                    )}
                  </p>
                )}
                <fieldset disabled={inputDisabled}>
                  {form.kind === 'create' ? (
                    <>
                      <label htmlFor="user-create-username">
                        {t('Identifiant *')}
                        <input
                          id="user-create-username"
                          name="username"
                          value={form.values.username}
                          maxLength={50}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={Boolean(fields.username)}
                          aria-describedby={described('username')}
                          onChange={(event) => changeCreate('username', event.target.value)}
                        />
                        {fieldError('username')}
                        <small>{t('3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.')}</small>
                      </label>
                      <label htmlFor="user-create-displayName">
                        {t('Nom affiché *')}
                        <input
                          id="user-create-displayName"
                          name="displayName"
                          value={form.values.displayName}
                          maxLength={80}
                          autoComplete="off"
                          aria-invalid={Boolean(fields.displayName)}
                          aria-describedby={described('displayName')}
                          onChange={(event) => changeCreate('displayName', event.target.value)}
                        />
                        {fieldError('displayName')}
                      </label>
                      <label htmlFor="user-create-email">
                        {t('E-mail')}
                        <input
                          id="user-create-email"
                          name="email"
                          type="email"
                          value={form.values.email ?? ''}
                          maxLength={254}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={Boolean(fields.email)}
                          aria-describedby={described('email')}
                          onChange={(event) => changeCreate('email', event.target.value)}
                        />
                        {fieldError('email')}
                        <small>
                          {t(
                            'Facultatif. Il permet à cette personne d’utiliser la connexion d’entreprise, si elle est configurée.',
                          )}
                        </small>
                      </label>
                      <label htmlFor="user-create-password">
                        {t('Mot de passe initial *')}
                        <input
                          id="user-create-password"
                          name="password"
                          type="password"
                          value={form.values.password}
                          maxLength={64}
                          autoComplete="new-password"
                          aria-invalid={Boolean(fields.password)}
                          aria-describedby={described('password')}
                          onChange={(event) => changeCreate('password', event.target.value)}
                        />
                        {fieldError('password')}
                        <small>{t('12 à 64 caractères. Les espaces saisis font partie du mot de passe.')}</small>
                      </label>
                      <label htmlFor="user-create-confirmation">
                        {t('Confirmer le mot de passe *')}
                        <input
                          id="user-create-confirmation"
                          name="confirmation"
                          type="password"
                          value={form.values.confirmation}
                          maxLength={64}
                          autoComplete="new-password"
                          aria-invalid={Boolean(fields.confirmation)}
                          aria-describedby={described('confirmation')}
                          onChange={(event) => changeCreate('confirmation', event.target.value)}
                        />
                        {fieldError('confirmation')}
                      </label>
                      <label htmlFor="user-create-role">
                        {t('Rôle')}
                        <select
                          id="user-create-role"
                          name="role"
                          value={form.values.role}
                          onChange={(event) => changeCreate('role', event.target.value)}
                        >
                          {Object.entries(roleLabels).map(([role, label]) => (
                            <option key={role} value={role}>
                              {t(label)}
                            </option>
                          ))}
                        </select>
                        {fieldError('role')}
                      </label>
                    </>
                  ) : (
                    <>
                      <label htmlFor="user-edit-displayName">
                        {t('Nom affiché *')}
                        <input
                          id="user-edit-displayName"
                          name="displayName"
                          value={form.values.displayName}
                          maxLength={80}
                          autoComplete="off"
                          aria-invalid={Boolean(fields.displayName)}
                          aria-describedby={described('displayName')}
                          onChange={(event) => changeEdit('displayName', event.target.value)}
                        />
                        {fieldError('displayName')}
                      </label>
                      <label htmlFor="user-edit-email">
                        {t('E-mail')}
                        <input
                          id="user-edit-email"
                          name="email"
                          type="email"
                          value={form.values.email ?? ''}
                          maxLength={254}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={Boolean(fields.email)}
                          aria-describedby={described('email')}
                          onChange={(event) => changeEdit('email', event.target.value)}
                        />
                        {fieldError('email')}
                        <small>
                          {t(
                            'Facultatif. Il permet la connexion d’entreprise ; le changer ferme les sessions de ce compte.',
                          )}
                        </small>
                      </label>
                      <label htmlFor="user-edit-role">
                        {t('Rôle')}
                        <select
                          id="user-edit-role"
                          name="role"
                          value={form.values.role}
                          onChange={(event) => changeEdit('role', event.target.value)}
                        >
                          {Object.entries(roleLabels).map(([role, label]) => (
                            <option key={role} value={role} disabled={Boolean(lastAdministrator) && role !== 'ADMIN'}>
                              {t(label)}
                            </option>
                          ))}
                        </select>
                        {fieldError('role')}
                      </label>
                      <label className="user-enabled-option" htmlFor="user-edit-enabled">
                        <input
                          id="user-edit-enabled"
                          name="enabled"
                          type="checkbox"
                          checked={form.values.enabled}
                          disabled={inputDisabled || form.base.id === state.user?.id || Boolean(lastAdministrator)}
                          onChange={(event) => changeEdit('enabled', event.target.checked)}
                        />
                        <span>{t('Autoriser l’accès à ce compte')}</span>
                      </label>
                      {fieldError('enabled')}
                      {form.base.id === state.user?.id && (
                        <p className="user-help">
                          {t('Pour désactiver votre propre compte, demandez à un autre administrateur.')}
                        </p>
                      )}
                      {lastAdministrator && (
                        <p className="user-help">
                          {t(
                            'Ce compte est le dernier administrateur actif de la liste. Un autre administrateur doit être disponible avant de modifier ses accès.',
                          )}
                        </p>
                      )}
                    </>
                  )}
                  <p className="user-role-help">
                    {t('Administrateur : comptes et parc · Éditeur : matériel et espaces · Lecteur : consultation.')}
                  </p>
                </fieldset>
                {error && (
                  <p className="user-error" role="alert">
                    {error}
                  </p>
                )}
                {securityConfirmation && (
                  <div className="user-confirm" role="alert">
                    <h3>{t('Confirmer les nouveaux accès ?')}</h3>
                    <p>
                      @{securityConfirmation.base.username} : {t(roleLabels[securityConfirmation.base.role])} →{' '}
                      {t(roleLabels[securityConfirmation.values.role])} ·{' '}
                      {securityConfirmation.values.enabled ? t('Accès autorisé') : t('Accès désactivé')}.
                    </p>
                    {!sameEmail(securityConfirmation.base.email, securityConfirmation.values.email) && (
                      <p>
                        {t('E-mail de connexion : {before} → {after}.', {
                          before: securityConfirmation.base.email ?? t('aucun'),
                          after: securityConfirmation.values.email ?? t('aucun'),
                        })}
                      </p>
                    )}
                    <p>
                      {securityConfirmation.values.enabled
                        ? t('Les sessions ouvertes de ce compte seront révoquées. Cette personne devra se reconnecter.')
                        : t(
                            'Les sessions ouvertes de ce compte seront révoquées. Cette personne devra se reconnecter après la réactivation de son accès.',
                          )}
                    </p>
                    {securityConfirmation.base.id === state.user?.id && (
                      <p>{t('Vous devrez vous reconnecter pour continuer avec vos nouveaux droits.')}</p>
                    )}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(pending)}
                        onClick={() => setSecurityConfirmation(null)}
                      >
                        {t('Revenir à la saisie')}
                      </Button>
                      <Button
                        type="button"
                        disabled={Boolean(pending) || !canAdmin || blocked || listStatus !== 'ready'}
                        onClick={() => {
                          const captured = latest.current.securityConfirmation
                          if (captured) void updateAccount(captured.base, captured.values)
                        }}
                      >
                        {t('Confirmer la modification du compte')}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="user-form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(pending) || discard !== null}
                    onClick={() => requestNavigate('list')}
                  >
                    {t('Annuler la saisie')}
                  </Button>
                  <Button type="submit" disabled={Boolean(submitDisabled)}>
                    {pending === 'create' || pending === 'update' ? (
                      <LoaderCircle className="animate-spin" />
                    ) : form.kind === 'create' ? (
                      <Plus />
                    ) : (
                      <Save />
                    )}
                    {form.kind === 'create' ? t('Créer le compte') : t('Enregistrer le compte')}
                  </Button>
                </div>
              </form>
            )}
            {form?.kind === 'edit' && (
              <AdminPasswordResetPanel
                key={`${form.base.id}:${resetGeneration}`}
                target={form.base}
                canAdmin={canAdmin}
                pending={Boolean(pending)}
                resetting={pending === 'reset'}
                unavailableReason={resetUnavailableReason}
                uncertain={passwordUncertain.has(form.base.id)}
                onDirtyChange={setResetDirty}
                onReset={resetPassword}
                onAcknowledgeUncertain={acknowledgePassword}
              />
            )}
            {discard !== null && (
              <div className="user-confirm" role="alert">
                <h3>{t('Abandonner cette saisie ?')}</h3>
                <p>
                  {t(
                    'Les champs non enregistrés seront effacés, y compris les mots de passe saisis pour la création ou la réinitialisation d’un compte.',
                  )}
                </p>
                <div>
                  <Button variant="outline" disabled={Boolean(pending)} onClick={() => setDiscard(null)}>
                    {t('Conserver ma saisie')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      if (!request.current && latest.current.discard !== null) navigate(latest.current.discard)
                    }}
                  >
                    {t('Effacer et continuer')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
