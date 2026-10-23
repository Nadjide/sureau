import { describe, expect, it } from 'vitest'
import { assetInputSchema } from './asset-input'

const input = {
  assetTag: 'SUR-0042', serialNumber: null, name: 'Poste de travail', brand: null, model: null,
  category: 'COMPUTER', status: 'AVAILABLE', purchaseDate: null,
}

describe('saisie d’un matériel', () => {
  it('normalise les champs du formulaire dans le contrat réel de l’API', () => {
    expect(assetInputSchema.parse({
      ...input, assetTag: '  SUR-0042  ', name: '  Poste de travail  ',
      serialNumber: '  SN-42  ', brand: '  Framework ', model: ' Laptop 13  ', purchaseDate: '2026-10-23',
    })).toEqual({
      assetTag: 'SUR-0042', serialNumber: 'SN-42', name: 'Poste de travail', brand: 'Framework', model: 'Laptop 13',
      category: 'COMPUTER', status: 'AVAILABLE', purchaseDate: '2026-10-23',
    })
  })

  it('envoie null pour les informations facultatives laissées vides', () => {
    expect(assetInputSchema.parse({ ...input, serialNumber: ' \t ', brand: '', model: ' ', purchaseDate: '' }))
      .toEqual(input)
  })

  it.each(['assetTag', 'name', 'category', 'status'])('refuse %s absent ou vide', (field) => {
    expect(assetInputSchema.safeParse({ ...input, [field]: '' }).success).toBe(false)
    expect(assetInputSchema.safeParse({ ...input, [field]: undefined }).success).toBe(false)
  })

  it.each(['assetTag', 'name'])('refuse un champ %s composé uniquement d’espaces', (field) => {
    expect(assetInputSchema.safeParse({ ...input, [field]: ' \t ' }).success).toBe(false)
  })

  it.each([
    { field: 'assetTag', limit: 50 },
    { field: 'name', limit: 150 },
    { field: 'serialNumber', limit: 100 },
    { field: 'brand', limit: 100 },
    { field: 'model', limit: 100 },
  ])('respecte la limite du serveur pour $field sans tronquer la saisie', ({ field, limit }) => {
    expect(assetInputSchema.safeParse({ ...input, [field]: 'x'.repeat(limit) }).success).toBe(true)
    expect(assetInputSchema.safeParse({ ...input, [field]: 'x'.repeat(limit + 1) }).success).toBe(false)
  })

  it('applique les limites après avoir retiré les espaces extérieurs', () => {
    expect(assetInputSchema.parse({ ...input, assetTag: `  ${'x'.repeat(50)}  ` }).assetTag).toHaveLength(50)
  })

  it.each(['2026-02-30', '2025-02-29', '23/10/2026', '2026-10-23T00:00:00Z'])('refuse la date civile invalide %s', (purchaseDate) => {
    expect(assetInputSchema.safeParse({ ...input, purchaseDate }).success).toBe(false)
  })

  it('conserve une date civile valide sans conversion de fuseau horaire', () => {
    expect(assetInputSchema.parse({ ...input, purchaseDate: '2024-02-29' }).purchaseDate).toBe('2024-02-29')
  })

  it.each([
    { category: 'PRINTER' }, { category: null }, { status: 'ACTIVE' }, { status: null },
  ])('refuse les catégories et statuts hors du contrat', (invalid) => {
    expect(assetInputSchema.safeParse({ ...input, ...invalid }).success).toBe(false)
  })

  it('n’accepte pas un identifiant serveur ou d’autres champs dans une saisie de création', () => {
    expect(assetInputSchema.safeParse({ ...input, id: 42 }).success).toBe(false)
    expect(assetInputSchema.safeParse({ ...input, createdAt: '2026-10-23T10:00:00Z' }).success).toBe(false)
  })
})
