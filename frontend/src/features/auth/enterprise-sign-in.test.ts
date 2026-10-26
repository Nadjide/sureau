import { describe, expect, it } from 'vitest'
import { enterpriseSignInLabel, enterpriseSignInOutcome, withoutOutcome } from './enterprise-sign-in'

describe('retour d’une connexion d’entreprise', () => {
  it('explique pourquoi aucune session n’a été ouverte', () => {
    expect(enterpriseSignInOutcome('?sso=no-account')).toMatch(/^Aucun compte Sureau actif ne correspond/)
    expect(enterpriseSignInOutcome('?sso=unavailable')).toMatch(/injoignable/)
    expect(enterpriseSignInOutcome('?sso=failed')).toMatch(/n’a pas abouti/)
    // Une raison inconnue d'une version plus récente du serveur reste un échec explicite.
    expect(enterpriseSignInOutcome('?sso=other')).toBe(enterpriseSignInOutcome('?sso=failed'))
    expect(enterpriseSignInOutcome('?tab=1')).toBeNull()
  })

  it('retire la raison de l’adresse en gardant le reste', () => {
    expect(withoutOutcome('https://sureau.exemple.org/?sso=no-account&tab=1#inventory')).toBe('/?tab=1#inventory')
    expect(withoutOutcome('https://sureau.exemple.org/?sso=failed')).toBe('/')
  })

  it('nomme le fournisseur quand l’instance le précise', () => {
    expect(enterpriseSignInLabel('Microsoft')).toBe('Se connecter avec Microsoft')
    expect(enterpriseSignInLabel(null)).toBe('Se connecter avec le compte de votre entreprise')
  })
})
