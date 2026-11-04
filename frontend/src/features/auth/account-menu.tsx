import { useLayoutEffect, useRef, useState } from 'react'
import { Download, KeyRound, LoaderCircle, LogOut, Users } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useSession } from './use-session'
import { roleLabels } from './session-state'
import { SourceCodeLink } from './source-code-link'
import { LazyPanel } from '@/components/lazy-panel'
import { t } from '@/lib/i18n'

const loadUserManagement = () =>
  import('@/features/users/user-management-sheet').then((module) => ({ default: module.UserManagementSheet }))
const loadChangePassword = () =>
  import('./change-password-sheet').then((module) => ({ default: module.ChangePasswordSheet }))

function UserManagementPlaceholder({
  open,
  onOpenChange,
  retry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  retry?: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('Gérer l’équipe')}</SheetTitle>
          <SheetDescription>{t('Les comptes et les droits d’accès à votre instance Sureau.')}</SheetDescription>
        </SheetHeader>
        <div className="account-details">
          {retry ? (
            <>
              <p role="alert">{t('La gestion de l’équipe n’a pas pu être chargée.')}</p>
              <Button variant="outline" onClick={retry}>
                {t('Réessayer le chargement')}
              </Button>
            </>
          ) : (
            <p className="auth-status" role="status">
              <LoaderCircle className="animate-spin" size={18} />
              {t('Préparation de la gestion des comptes…')}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ChangePasswordPlaceholder({
  open,
  onOpenChange,
  retry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  retry?: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('Changer mon mot de passe')}</SheetTitle>
          <SheetDescription>{t('Le mot de passe de votre compte sur cette instance Sureau.')}</SheetDescription>
        </SheetHeader>
        <div className="account-details">
          {retry ? (
            <>
              <p role="alert">{t('Le formulaire de changement de mot de passe n’a pas pu être chargé.')}</p>
              <Button variant="outline" onClick={retry}>
                {t('Réessayer le chargement')}
              </Button>
            </>
          ) : (
            <p className="auth-status" role="status">
              <LoaderCircle className="animate-spin" size={18} />
              {t('Préparation du formulaire…')}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export interface WorkspaceDepartureGuard {
  dirty: boolean
  saving: boolean
  exportDraft: () => boolean
}

export function AccountMenu({ departureGuard }: { departureGuard?: WorkspaceDepartureGuard }) {
  const { state, logout, busy, canAdmin } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [exportNotice, setExportNotice] = useState(false)
  const [pending, setPending] = useState(false)
  const [managementRequested, setManagementRequested] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [passwordRequested, setPasswordRequested] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const pendingRef = useRef(false)
  const current = useRef({ departureGuard, busy, phase: state.phase, confirmation, logout, canAdmin })
  useLayoutEffect(() => {
    current.current = { departureGuard, busy, phase: state.phase, confirmation, logout, canAdmin }
  }, [departureGuard, busy, state.phase, confirmation, logout, canAdmin])
  const stayButton = useRef<HTMLButtonElement | null>(null)
  const logoutButton = useRef<HTMLButtonElement | null>(null)
  if (!state.user) return null
  const user = state.user
  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('fr')

  async function signOut(confirmed = false) {
    const latest = current.current
    if (pendingRef.current || latest.busy || latest.phase !== 'authenticated') return
    if (confirmed && !latest.confirmation) return
    if (latest.departureGuard?.saving) {
      setError(t('L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.'))
      return
    }
    if (latest.departureGuard?.dirty && !confirmed) {
      setError(null)
      setExportNotice(false)
      setConfirmation(true)
      return
    }
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      await latest.logout()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('La déconnexion n’a pas pu être confirmée. Réessayez.'))
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function exportDraft() {
    if (pendingRef.current) return
    const guard = current.current.departureGuard
    if (!guard) return
    try {
      if (guard.exportDraft() !== true) {
        setExportNotice(false)
        setError(t('L’export du brouillon n’a pas pu être préparé. Votre session reste ouverte.'))
        return
      }
      setExportNotice(true)
      setError(null)
    } catch (failure) {
      setExportNotice(false)
      setError(
        failure instanceof Error
          ? failure.message
          : t('L’export du brouillon n’a pas pu être préparé. Votre session reste ouverte.'),
      )
    }
  }

  const saving = departureGuard?.saving === true
  const dirty = departureGuard?.dirty === true
  const disabled = pending || busy || saving || state.phase !== 'authenticated'
  return (
    <>
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (pendingRef.current) return
          setSheetOpen(open)
          if (!open) {
            setConfirmation(false)
            setError(null)
            setExportNotice(false)
          }
        }}
      >
        <SheetTrigger asChild>
          <button type="button" className="user-avatar account-trigger">
            <span aria-hidden="true">{initials}</span>
            <span className="sr-only">{t('Compte de {name}', { name: user.displayName })}</span>
          </button>
        </SheetTrigger>
        <SheetContent className="account-sheet">
          <SheetHeader>
            <SheetTitle>{t('Votre compte')}</SheetTitle>
            <SheetDescription>{t('Votre session sur cette instance Sureau.')}</SheetDescription>
          </SheetHeader>
          <div className="account-details">
            <span className="user-avatar" aria-hidden="true">
              {initials}
            </span>
            <h2>{user.displayName}</h2>
            <p>@{user.username}</p>
            <p>{t(roleLabels[user.role])}</p>
            {canAdmin && (
              <Button
                variant="outline"
                disabled={pending || busy}
                onClick={() => {
                  const latest = current.current
                  if (!latest.canAdmin || pendingRef.current || latest.busy || latest.phase !== 'authenticated') return
                  setSheetOpen(false)
                  setManagementRequested(true)
                  setManagementOpen(true)
                }}
              >
                <Users aria-hidden="true" />
                {t('Gérer l’équipe')}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={pending || busy || state.phase !== 'authenticated'}
              onClick={() => {
                const latest = current.current
                if (pendingRef.current || latest.busy || latest.phase !== 'authenticated') return
                setSheetOpen(false)
                setPasswordRequested(true)
                setPasswordOpen(true)
              }}
            >
              <KeyRound aria-hidden="true" />
              {t('Changer mon mot de passe')}
            </Button>
            <LanguageSwitch className="account-language" showLabel />
            <Button
              ref={logoutButton}
              variant="outline"
              disabled={disabled}
              onClick={() => {
                void signOut()
              }}
            >
              {pending || busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {t('Se déconnecter')}
            </Button>
            {saving && (
              <p className="account-departure-status" role="status">
                {t('L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.')}
              </p>
            )}
            {error && !confirmation && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <p className="account-source">
              {t('Sureau est un logiciel libre, sous licence AGPL-3.0.')} <SourceCodeLink />
            </p>
          </div>
          <Dialog.Root
            open={confirmation}
            onOpenChange={(open) => {
              if (!pendingRef.current) setConfirmation(open)
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="account-departure-overlay" />
              <Dialog.Content
                role="alertdialog"
                className="account-departure-dialog"
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  stayButton.current?.focus()
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  logoutButton.current?.focus()
                }}
                onEscapeKeyDown={(event) => {
                  if (pendingRef.current) event.preventDefault()
                }}
                onInteractOutside={(event) => {
                  if (pendingRef.current) event.preventDefault()
                }}
              >
                <div className="account-departure-icon">
                  <LogOut size={23} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <Dialog.Title>{dirty ? t('Quitter sans enregistrer ?') : t('Fermer votre session ?')}</Dialog.Title>
                <Dialog.Description>
                  {dirty
                    ? t(
                        'Des modifications ou une saisie peuvent être en cours. Restez dans Sureau pour les appliquer et les enregistrer avant de quitter.',
                      )
                    : t('L’espace est enregistré. Vous pouvez fermer votre session.')}
                </Dialog.Description>
                {dirty && (
                  <p className="account-departure-status">
                    {t(
                      'L’export conserve le plan et les localisations appliqués au brouillon. Les saisies non appliquées n’y figurent pas.',
                    )}
                  </p>
                )}
                {saving && (
                  <p className="account-departure-status" role="status">
                    {t(
                      'L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.',
                    )}
                  </p>
                )}
                {exportNotice && (
                  <p className="account-departure-status" role="status">
                    {t('L’export du brouillon a été préparé. Il n’enregistre aucune modification sur le serveur.')}
                  </p>
                )}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="account-departure-actions">
                  <Button
                    ref={stayButton}
                    variant="outline"
                    disabled={pending || busy}
                    onClick={() => setConfirmation(false)}
                  >
                    {t('Rester dans Sureau')}
                  </Button>
                  {departureGuard && (
                    <Button variant="outline" disabled={pending || busy} onClick={exportDraft}>
                      <Download aria-hidden="true" />
                      {t('Exporter le brouillon')}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => {
                      void signOut(true)
                    }}
                  >
                    {pending ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <LogOut aria-hidden="true" />
                    )}
                    {dirty ? t('Quitter sans enregistrer') : t('Se déconnecter')}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </SheetContent>
      </Sheet>
      {managementRequested && (
        <LazyPanel
          load={loadUserManagement}
          panelProps={{ open: managementOpen, onOpenChange: setManagementOpen }}
          loading={<UserManagementPlaceholder open={managementOpen} onOpenChange={setManagementOpen} />}
          failure={(retry) => (
            <UserManagementPlaceholder open={managementOpen} onOpenChange={setManagementOpen} retry={retry} />
          )}
        />
      )}
      {passwordRequested && (
        <LazyPanel
          load={loadChangePassword}
          panelProps={{ open: passwordOpen, onOpenChange: setPasswordOpen }}
          loading={<ChangePasswordPlaceholder open={passwordOpen} onOpenChange={setPasswordOpen} />}
          failure={(retry) => (
            <ChangePasswordPlaceholder open={passwordOpen} onOpenChange={setPasswordOpen} retry={retry} />
          )}
        />
      )}
    </>
  )
}
