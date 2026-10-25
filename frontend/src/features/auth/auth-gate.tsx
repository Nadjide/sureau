import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Layers3, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import { useSession } from './use-session'
import './auth.css'

function CredentialsForm({ setup = false, expired = false }: { setup?: boolean; expired?: boolean }) {
  const session = useSession()
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (session.busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const username = String(data.get('username') || '').trim().toLowerCase()
    const password = String(data.get('password') || '')
    setError(null); setFields({})
    if (setup && password !== data.get('confirmation')) {
      setError('Les deux mots de passe doivent être identiques.'); return
    }
    try {
      if (setup) await session.setup({ username, password,
        setupToken: String(data.get('setupToken') || '').trim(), displayName: String(data.get('displayName') || '').trim() })
      else await session.login({ username, password })
      form.reset()
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      setError(failure instanceof Error ? failure.message : 'La connexion n’a pas pu être établie.')
      if (failure instanceof ApiError) setFields(failure.fieldErrors)
      // A successful setup followed by a failed login can be resumed from the login screen.
    }
  }

  function fieldError(name: string) {
    return fields[name] ? <small id={`auth-${name}-error`} className="auth-field-error">{fields[name]}</small> : null
  }
  function describedBy(name: string) { return fields[name] ? `auth-${name}-error` : undefined }

  return <form className="auth-form" onSubmit={(event) => { void submit(event) }}>
    <fieldset disabled={session.busy}>
      {setup && <>
        <label htmlFor="auth-setup-token">Clé d’installation
          <input id="auth-setup-token" name="setupToken" type="password" required maxLength={512} autoComplete="off" aria-invalid={Boolean(fields.setupToken)} aria-describedby={describedBy('setupToken')} />
          {fieldError('setupToken')}
          <small>La clé SUREAU_SETUP_TOKEN définie à l’installation de votre instance.</small>
        </label>
        <label htmlFor="auth-display-name">Votre nom
          <input id="auth-display-name" name="displayName" required maxLength={80} autoComplete="name" aria-invalid={Boolean(fields.displayName)} aria-describedby={describedBy('displayName')} />
          {fieldError('displayName')}
        </label>
      </>}
      <label htmlFor="auth-username">Identifiant
        <input id="auth-username" name="username" required minLength={setup ? 3 : 1} maxLength={50} autoComplete="username" autoCapitalize="none" spellCheck={false}
          {...(setup ? { pattern: '[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}', title: '3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.' } : {})}
          defaultValue={expired ? session.state.user?.username : ''} aria-invalid={Boolean(fields.username)} aria-describedby={describedBy('username')} />
        {fieldError('username')}
        {setup && <small>3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.</small>}
      </label>
      <label htmlFor="auth-password">Mot de passe
        <input id="auth-password" name="password" type="password" required minLength={setup ? 12 : 1} maxLength={64} autoComplete={setup ? 'new-password' : 'current-password'} aria-invalid={Boolean(fields.password)} aria-describedby={describedBy('password')} />
        {fieldError('password')}
        {setup && <small>12 à 64 caractères. Utilisez un mot de passe unique pour Sureau.</small>}
      </label>
      {setup && <label htmlFor="auth-confirmation">Confirmer le mot de passe
        <input id="auth-confirmation" name="confirmation" type="password" required minLength={12} maxLength={64} autoComplete="new-password" />
      </label>}
    </fieldset>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <Button type="submit" className="auth-submit" disabled={session.busy}>
      {session.busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
      {session.busy ? 'Connexion en cours…' : setup ? 'Créer mon espace administrateur' : expired ? 'Reprendre ma session' : 'Ouvrir mon espace'}
    </Button>
    {setup && <button className="auth-text-button" type="button" disabled={session.busy} onClick={session.refresh}>Un compte existe déjà ? Vérifier la connexion</button>}
  </form>
}

function AuthPage() {
  const { state, refresh } = useSession()
  const setup = state.phase === 'setup-required'
  const waiting = state.phase === 'checking'
  return <main className="auth-page">
    <section className="auth-story" aria-label="Bienvenue dans Sureau">
      <Brand />
      <div className="auth-story-copy"><p className="eyebrow">LE MATÉRIEL, DANS SON ESPACE.</p>
        <h1>Un autre regard<br />sur votre parc.</h1>
        <p>De chaque équipement à chaque étage, retrouvez le fil de vos espaces de travail.</p>
        <div className="auth-plan" aria-hidden="true"><div className="auth-plan-room"><i /><i /><i /><i /><span /><span /></div><Layers3 size={30} strokeWidth={1} /></div>
      </div>
      <p className="auth-story-foot"><ShieldCheck size={16} aria-hidden="true" /> Votre instance. Votre équipe. Vos espaces.</p>
    </section>
    <section className="auth-panel" aria-label={setup ? 'Installation de Sureau' : 'Connexion à Sureau'}>
      <div className="auth-panel-content">
        <p className="eyebrow">{setup ? 'PREMIER PAS' : 'VOTRE ATELIER SPATIAL'}</p>
        <h2>{waiting ? 'Un instant…' : state.phase === 'error' ? 'Connexion indisponible' : setup ? 'Bienvenue chez vous.' : 'Heureux de vous retrouver.'}</h2>
        {waiting ? <p className="auth-status" role="status"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> Vérification de votre instance Sureau…</p>
          : state.phase === 'error' ? <><p className="auth-error" role="alert">{state.error}</p><Button onClick={refresh} variant="outline">Réessayer la connexion</Button></>
            : <><p className="auth-intro">{setup ? 'Créez le premier compte administrateur pour ouvrir votre instance Sureau.' : 'Connectez-vous pour accéder au matériel de votre équipe et composer vos espaces.'}</p>{state.error && <p className="auth-status" role="status">{state.error}</p>}<CredentialsForm key={state.phase} setup={setup} /></>}
        <p className="auth-footnote">SUREAU <span>·</span> Le matériel, dans son espace.</p>
      </div>
    </section>
  </main>
}

/** Keep a suspended application's drafts mounted until the user signs out or changes identity. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useSession()
  if (!state.user) return <AuthPage />
  const expired = state.phase === 'expired'
  return <>
    <div key={`${state.generation}:${state.user.id}`} className="authenticated-application" inert={expired} aria-hidden={expired || undefined}>{children}</div>
    <Dialog.Root open={expired}>
      <Dialog.Portal>
        <Dialog.Overlay className="auth-session-overlay" />
        <Dialog.Content className="auth-session-dialog" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
          <Brand />
          <Dialog.Title>Reprenons là où vous en étiez.</Dialog.Title>
          <Dialog.Description>{state.error
            ? <>{state.error} Utilisez le même compte pour conserver votre brouillon. Un autre compte ouvrira une nouvelle session.</>
            : <>Votre session a expiré. Reconnectez-vous avec le même compte pour retrouver votre travail en cours. Un autre compte ouvrira une nouvelle session.</>}</Dialog.Description>
          <CredentialsForm expired />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}
