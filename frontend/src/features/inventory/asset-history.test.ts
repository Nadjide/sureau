import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { changeValue, eventAuthor, eventTitle, getAssetHistory, type AssetEvent } from './asset-history'

const moved: AssetEvent = {
  id: 7,
  occurredAt: '2026-10-26T09:42:00Z',
  action: 'LOCATED',
  actor: { username: 'camille', displayName: 'Camille Bernard' },
  changes: [{ field: 'location', from: 'Poste 1 · Atelier · Rez-de-chaussée', to: 'Poste 2 · Atelier · Rez-de-chaussée' }],
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
}

describe('getAssetHistory', () => {
  it('lit l’historique d’un matériel, y compris un auteur non enregistré et une action inconnue', async () => {
    const created = { id: 1, occurredAt: '2026-01-05T08:00:00+01:00', action: 'CREATED', actor: null, changes: [] }
    const future = { ...moved, id: 9, action: 'ARCHIVED_ELSEWHERE' }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([future, moved, created]))
    const { signal } = new AbortController()

    await expect(getAssetHistory(42, signal, fetcher)).resolves.toEqual([future, moved, created])
    expect(fetcher).toHaveBeenCalledWith('/api/assets/42/history', expect.objectContaining({ method: 'GET', signal }))
  })

  it('refuse une réponse incompatible au lieu d’afficher un historique faux', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([{ ...moved, changes: 'aucun' }]))

    await expect(getAssetHistory(42, new AbortController().signal, fetcher)).rejects.toMatchObject({
      constructor: ApiError, kind: 'invalid-response',
    })
  })
})

describe('formulation des événements', () => {
  it('distingue un placement, un déplacement et un retrait de poste', () => {
    expect(eventTitle(moved)).toBe('Changé de poste')
    expect(eventTitle({ ...moved, changes: [{ field: 'location', from: null, to: 'Poste 1' }] })).toBe('Placé sur un poste')
    expect(eventTitle({ ...moved, changes: [{ field: 'location', from: 'Poste 1', to: null }] })).toBe('Retiré de son poste')
    expect(eventTitle({ ...moved, action: 'ARCHIVED_ELSEWHERE' })).toBe('Changement enregistré')
  })

  it('montre les valeurs comme dans la fiche', () => {
    expect(changeValue('status', 'MAINTENANCE')).toBe('En maintenance')
    expect(changeValue('category', 'NETWORK_EQUIPMENT')).toBe('Équipement réseau')
    expect(changeValue('purchaseDate', '2026-03-02')).toBe('02/03/2026')
    expect(changeValue('brand', null)).toBe('Non renseigné')
    expect(changeValue('location', null)).toBe('Non localisé')
    // Une valeur qu'une version plus récente du serveur saurait nommer reste lisible telle quelle.
    expect(changeValue('status', 'ON_LOAN')).toBe('ON_LOAN')
  })

  it('nomme l’auteur ou signale qu’il n’a pas été enregistré', () => {
    expect(eventAuthor(moved)).toBe('Camille Bernard (@camille)')
    expect(eventAuthor({ ...moved, actor: null })).toBe('Auteur non enregistré')
  })
})
