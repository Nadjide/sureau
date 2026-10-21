import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AssetApiError } from '@/features/inventory/asset-api'
import type { Asset } from '@/features/inventory/asset-schema'
import { SpatialInspector } from './spatial-inspector'

const asset: Asset = {
  id: 73,
  assetTag: 'SNT-HS-0073',
  name: 'Casque du poste',
  serialNumber: null,
  brand: null,
  model: null,
  category: 'HEADSET',
  status: 'MAINTENANCE',
  purchaseDate: null,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
}

function render(status: 'ready' | 'loading' | 'error', selectedAssetId: number | null = 73) {
  const props: ComponentProps<typeof SpatialInspector> = {
    selectedWorkstationId: 'desk-02',
    selectedAssetId,
    onSelectAsset: vi.fn(),
    onOpenInventory: vi.fn(),
    onShowInPlan: vi.fn(),
    inventory: {
      assets: [asset],
      status,
      error: status === 'error' ? new AssetApiError('network', 'Connexion indisponible') : null,
      reload: vi.fn(),
    },
    local: { locations: { 73: 'desk-02' }, warning: null, persisted: true, associate: vi.fn() },
  }
  return renderToStaticMarkup(createElement(SpatialInspector, props))
}

describe('fiche spatiale et état de l’inventaire', () => {
  it('signale une panne tout en conservant les informations et le statut reçus', () => {
    const markup = render('error')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Les dernières données reçues restent affichées.')
    expect(markup).toContain('Casque du poste')
    expect(markup).toContain('En maintenance')
  })

  it('indique une actualisation en cours sur une fiche déjà chargée', () => {
    const markup = render('loading')
    expect(markup).toContain('Actualisation de l’inventaire…')
    expect(markup).toContain('Casque du poste')
  })

  it('ne présente pas les données fraîchement chargées comme périmées', () => {
    const markup = render('ready')
    expect(markup).not.toContain('Inventaire indisponible')
    expect(markup).not.toContain('dernières données reçues')
    expect(markup).toContain('Casque du poste')
  })

  it('conserve aussi l’avertissement dans la liste du poste', () => {
    const markup = render('error', null)
    expect(markup).toContain('Inventaire indisponible. Les localisations sont conservées')
    expect(markup).toContain('Casque du poste')
  })
})
