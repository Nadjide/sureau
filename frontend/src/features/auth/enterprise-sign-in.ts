/** Leaving for this address hands the sign-in to the enterprise identity provider. */
export const enterpriseSignInPath = '/oauth2/authorization/oidc'

const outcomes: Record<string, string> = {
  'no-account': 'Aucun compte Sureau actif ne correspond à votre identité. Demandez à un administrateur de renseigner votre adresse e-mail sur votre compte.',
  unavailable: 'Le fournisseur d’identité de votre entreprise est injoignable pour le moment. Réessayez plus tard ou connectez-vous avec votre mot de passe.',
  failed: 'La connexion par le fournisseur d’identité n’a pas abouti. Réessayez ou connectez-vous avec votre mot de passe.',
}

/** The message for the `?sso=` reason the server adds when enterprise sign-in opened no session. */
export function enterpriseSignInOutcome(search: string): string | null {
  const reason = new URLSearchParams(search).get('sso')
  if (reason === null) return null
  return outcomes[reason] ?? outcomes.failed!
}

/** The same address without that reason, so that a reload or a bookmark does not repeat the message. */
export function withoutOutcome(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('sso')
  return `${url.pathname}${url.search}${url.hash}`
}

export function enterpriseSignInLabel(name: string | null): string {
  return `Se connecter avec ${name ?? 'le compte de votre entreprise'}`
}
