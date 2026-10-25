import { useLayoutEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, LogOut } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useSession } from './use-session'
import { roleLabels } from './session-state'

export interface WorkspaceDepartureGuard {
  dirty: boolean
  saving: boolean
  exportDraft: () => boolean
}

export function AccountMenu({ departureGuard }: { departureGuard?: WorkspaceDepartureGuard }) {
  const { state, logout, busy } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [exportNotice, setExportNotice] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const current = useRef({ departureGuard, busy, phase: state.phase, confirmation, logout })
  useLayoutEffect(() => {
    current.current = { departureGuard, busy, phase: state.phase, confirmation, logout }
  }, [departureGuard, busy, state.phase, confirmation, logout])
  const stayButton = useRef<HTMLButtonElement | null>(null)
  const logoutButton = useRef<HTMLButtonElement | null>(null)
  if (!state.user) return null
  const user = state.user
  const initials = user.displayName.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('fr')

  async function signOut(confirmed = false) {
    const latest = current.current
    if (pendingRef.current || latest.busy || latest.phase !== 'authenticated') return
    if (confirmed && !latest.confirmation) return
    if (latest.departureGuard?.saving) {
      setError('L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.')
      return
    }
    if (latest.departureGuard?.dirty && !confirmed) {
      setError(null); setExportNotice(false); setConfirmation(true)
      return
    }
    pendingRef.current = true
    setPending(true)
    setError(null)
    try { await latest.logout() } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'La déconnexion n’a pas pu être confirmée. Réessayez.')
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
        setError('L’export du brouillon n’a pas pu être préparé. Votre session reste ouverte.')
        return
      }
      setExportNotice(true)
      setError(null)
    } catch (failure) {
      setExportNotice(false)
      setError(failure instanceof Error ? failure.message : 'L’export du brouillon n’a pas pu être préparé. Votre session reste ouverte.')
    }
  }

  const saving = departureGuard?.saving === true
  const dirty = departureGuard?.dirty === true
  const disabled = pending || busy || saving || state.phase !== 'authenticated'
  return <Sheet open={sheetOpen} onOpenChange={(open) => {
    if (pendingRef.current) return
    setSheetOpen(open)
    if (!open) { setConfirmation(false); setError(null); setExportNotice(false) }
  }}>
    <SheetTrigger asChild><button type="button" className="user-avatar account-trigger" aria-label={`Compte de ${user.displayName}`}>{initials}</button></SheetTrigger>
    <SheetContent className="account-sheet">
      <SheetHeader><SheetTitle>Votre compte</SheetTitle><SheetDescription>Votre session sur cette instance Sureau.</SheetDescription></SheetHeader>
      <div className="account-details"><span className="user-avatar" aria-hidden="true">{initials}</span><h2>{user.displayName}</h2><p>@{user.username}</p><p>{roleLabels[user.role]}</p>
        <Button ref={logoutButton} variant="outline" disabled={disabled} onClick={() => { void signOut() }}>{pending || busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}Se déconnecter</Button>
        {saving && <p className="account-departure-status" role="status">L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.</p>}
        {error && !confirmation && <p className="auth-error" role="alert">{error}</p>}
      </div>
      <Dialog.Root open={confirmation} onOpenChange={(open) => { if (!pendingRef.current) setConfirmation(open) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="account-departure-overlay" />
          <Dialog.Content role="alertdialog" className="account-departure-dialog"
            onOpenAutoFocus={(event) => { event.preventDefault(); stayButton.current?.focus() }}
            onCloseAutoFocus={(event) => { event.preventDefault(); logoutButton.current?.focus() }}
            onEscapeKeyDown={(event) => { if (pendingRef.current) event.preventDefault() }}
            onInteractOutside={(event) => { if (pendingRef.current) event.preventDefault() }}>
            <div className="account-departure-icon"><LogOut size={23} strokeWidth={1.5} aria-hidden="true" /></div>
            <Dialog.Title>{dirty ? 'Quitter sans enregistrer ?' : 'Fermer votre session ?'}</Dialog.Title>
            <Dialog.Description>{dirty
              ? 'Des modifications ou une saisie peuvent être en cours. Restez dans Sureau pour les appliquer et les enregistrer avant de quitter.'
              : 'L’espace est enregistré. Vous pouvez fermer votre session.'}</Dialog.Description>
            {dirty && <p className="account-departure-status">L’export conserve le plan et les localisations appliqués au brouillon. Les saisies non appliquées n’y figurent pas.</p>}
            {saving && <p className="account-departure-status" role="status">L’enregistrement de l’espace est en cours. Attendez sa confirmation avant de vous déconnecter.</p>}
            {exportNotice && <p className="account-departure-status" role="status">L’export du brouillon a été préparé. Il n’enregistre aucune modification sur le serveur.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <div className="account-departure-actions">
              <Button ref={stayButton} variant="outline" disabled={pending || busy} onClick={() => setConfirmation(false)}>Rester dans Sureau</Button>
              {departureGuard && <Button variant="outline" disabled={pending || busy} onClick={exportDraft}><Download aria-hidden="true" />Exporter le brouillon</Button>}
              <Button variant="destructive" disabled={disabled} onClick={() => { void signOut(true) }}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}{dirty ? 'Quitter sans enregistrer' : 'Se déconnecter'}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SheetContent>
  </Sheet>
}
