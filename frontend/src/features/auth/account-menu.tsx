import { useState } from 'react'
import { LoaderCircle, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useSession } from './use-session'
import { roleLabels } from './session-state'

export function AccountMenu() {
  const { state, logout, busy } = useSession()
  const [error, setError] = useState<string | null>(null)
  if (!state.user) return null
  const user = state.user
  const initials = user.displayName.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('fr')
  async function signOut() {
    setError(null)
    try { await logout() } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'La déconnexion n’a pas pu être confirmée. Réessayez.')
    }
  }
  return <Sheet>
    <SheetTrigger asChild><button type="button" className="user-avatar account-trigger" aria-label={`Compte de ${user.displayName}`}>{initials}</button></SheetTrigger>
    <SheetContent className="account-sheet">
      <SheetHeader><SheetTitle>Votre compte</SheetTitle><SheetDescription>Votre session sur cette instance Sureau.</SheetDescription></SheetHeader>
      <div className="account-details"><span className="user-avatar" aria-hidden="true">{initials}</span><h2>{user.displayName}</h2><p>@{user.username}</p><p>{roleLabels[user.role]}</p>
        <Button variant="outline" disabled={busy} onClick={() => { void signOut() }}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}Se déconnecter</Button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </SheetContent>
  </Sheet>
}
