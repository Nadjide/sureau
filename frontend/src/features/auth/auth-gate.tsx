import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Building2, Layers3, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Brand } from '@/components/brand'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import { t, useLanguage } from '@/lib/i18n'
import { enterpriseSignInLabel, enterpriseSignInOutcome, enterpriseSignInPath, withoutOutcome } from './enterprise-sign-in'
import { useSession } from './use-session'
import './auth.css'

/** Enterprise sign-in leaves the page; the provider sends the person back once identified. */
function EnterpriseSignInLink({ expired = false }: { expired?: boolean }) {
  const { enterpriseSignIn, busy } = useSession()
  if (!enterpriseSignIn) return null
  return <div className="auth-enterprise">
    <p className="auth-separator"><span>{t('ou')}</span></p>
    <Button asChild variant="outline" className="auth-enterprise-link">
      <a href={enterpriseSignInPath} aria-disabled={busy || undefined} onClick={(event) => { if (busy) event.preventDefault() }}>
        <Building2 aria-hidden="true" />{enterpriseSignInLabel(enterpriseSignIn.name)}
      </a>
    </Button>
    {expired && <small>{t('Cette connexion quitte la page : les modifications non enregistrées seront perdues.')}</small>}
  </div>
}

/** Reads once, then removes from the address, the reason an enterprise sign-in came back without a session. */
function useEnterpriseSignInOutcome(): string | null {
  const [outcome] = useState(() => enterpriseSignInOutcome(window.location.search))
  useEffect(() => {
    if (outcome) window.history.replaceState(window.history.state, '', withoutOutcome(window.location.href))
  }, [outcome])
  return outcome
}

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
      setError(t('Les deux mots de passe doivent être identiques.')); return
    }
    try {
      if (setup) await session.setup({ username, password,
        setupToken: String(data.get('setupToken') || '').trim(), displayName: String(data.get('displayName') || '').trim() })
      else await session.login({ username, password })
      form.reset()
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      setError(failure instanceof Error ? failure.message : t('La connexion n’a pas pu être établie.'))
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
        <label htmlFor="auth-setup-token">{t('Clé d’installation')}
          <input id="auth-setup-token" name="setupToken" type="password" required maxLength={512} autoComplete="off" aria-invalid={Boolean(fields.setupToken)} aria-describedby={describedBy('setupToken')} />
          {fieldError('setupToken')}
          <small>{t('La clé SUREAU_SETUP_TOKEN définie à l’installation de votre instance.')}</small>
        </label>
        <label htmlFor="auth-display-name">{t('Votre nom')}
          <input id="auth-display-name" name="displayName" required maxLength={80} autoComplete="name" aria-invalid={Boolean(fields.displayName)} aria-describedby={describedBy('displayName')} />
          {fieldError('displayName')}
        </label>
      </>}
      <label htmlFor="auth-username">{t('Identifiant')}
        <input id="auth-username" name="username" required minLength={setup ? 3 : 1} maxLength={50} autoComplete="username" autoCapitalize="none" spellCheck={false}
          {...(setup ? { pattern: '[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}', title: t('3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.') } : {})}
          defaultValue={expired ? session.state.user?.username : ''} aria-invalid={Boolean(fields.username)} aria-describedby={describedBy('username')} />
        {fieldError('username')}
        {setup && <small>{t('3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.')}</small>}
      </label>
      <label htmlFor="auth-password">{t('Mot de passe')}
        <input id="auth-password" name="password" type="password" required minLength={setup ? 12 : 1} maxLength={64} autoComplete={setup ? 'new-password' : 'current-password'} aria-invalid={Boolean(fields.password)} aria-describedby={describedBy('password')} />
        {fieldError('password')}
        {setup && <small>{t('12 à 64 caractères. Utilisez un mot de passe unique pour Sureau.')}</small>}
      </label>
      {setup && <label htmlFor="auth-confirmation">{t('Confirmer le mot de passe')}
        <input id="auth-confirmation" name="confirmation" type="password" required minLength={12} maxLength={64} autoComplete="new-password" />
      </label>}
    </fieldset>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <Button type="submit" className="auth-submit" disabled={session.busy}>
      {session.busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
      {session.busy ? t('Connexion en cours…') : setup ? t('Créer mon espace administrateur') : expired ? t('Reprendre ma session') : t('Ouvrir mon espace')}
    </Button>
    {setup && <button className="auth-text-button" type="button" disabled={session.busy} onClick={session.refresh}>{t('Un compte existe déjà ? Vérifier la connexion')}</button>}
  </form>
}

function AuthPage() {
  useLanguage()
  const { state, refresh } = useSession()
  const outcome = useEnterpriseSignInOutcome()
  const setup = state.phase === 'setup-required'
  const waiting = state.phase === 'checking'
  return <main className="auth-page">
    <section className="auth-story" aria-label={t('Bienvenue dans Sureau')}>
      <Brand />
      <div className="auth-story-copy"><p className="eyebrow">{t('LE MATÉRIEL, DANS SON ESPACE.')}</p>
        <h1>{t('Un autre regard')}<br />{t('sur votre parc.')}</h1>
        <p>{t('De chaque équipement à chaque étage, retrouvez le fil de vos espaces de travail.')}</p>
        <div className="auth-plan" aria-hidden="true"><div className="auth-plan-room"><i /><i /><i /><i /><span /><span /></div><Layers3 size={30} strokeWidth={1} /></div>
      </div>
      <p className="auth-story-foot"><ShieldCheck size={16} aria-hidden="true" /> {t('Votre instance. Votre équipe. Vos espaces.')}</p>
    </section>
    <section className="auth-panel" aria-label={setup ? t('Installation de Sureau') : t('Connexion à Sureau')}>
      <LanguageSwitch className="auth-language" />
      <div className="auth-panel-content">
        <p className="eyebrow">{setup ? t('PREMIER PAS') : t('VOTRE ATELIER SPATIAL')}</p>
        <h2>{waiting ? t('Un instant…') : state.phase === 'error' ? t('Connexion indisponible') : setup ? t('Bienvenue chez vous.') : t('Heureux de vous retrouver.')}</h2>
        {waiting ? <p className="auth-status" role="status"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> {t('Vérification de votre instance Sureau…')}</p>
          : state.phase === 'error' ? <><p className="auth-error" role="alert">{state.error}</p><Button onClick={refresh} variant="outline">{t('Réessayer la connexion')}</Button></>
            : <><p className="auth-intro">{setup ? t('Créez le premier compte administrateur pour ouvrir votre instance Sureau.') : t('Connectez-vous pour accéder au matériel de votre équipe et composer vos espaces.')}</p>{state.error && <p className="auth-status" role="status">{state.error}</p>}{outcome && !setup && <p className="auth-error" role="alert">{outcome}</p>}<CredentialsForm key={state.phase} setup={setup} />{!setup && <EnterpriseSignInLink />}</>}
        <p className="auth-footnote">SUREAU <span>·</span> {t('Le matériel, dans son espace.')}</p>
      </div>
    </section>
  </main>
}

/** Keep a suspended application's drafts mounted until the user signs out or changes identity. */
export function AuthGate({ children }: { children: ReactNode }) {
  const language = useLanguage()
  useEffect(() => { document.title = t('Sureau — Atelier spatial') }, [language])
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
          <Dialog.Title>{t('Reprenons là où vous en étiez.')}</Dialog.Title>
          <Dialog.Description>{state.error
            ? <>{state.error} {t('Utilisez le même compte pour conserver votre brouillon. Un autre compte ouvrira une nouvelle session.')}</>
            : <>{t('Votre session a expiré. Reconnectez-vous avec le même compte pour retrouver votre travail en cours. Un autre compte ouvrira une nouvelle session.')}</>}</Dialog.Description>
          <CredentialsForm expired />
          <EnterpriseSignInLink expired />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}
