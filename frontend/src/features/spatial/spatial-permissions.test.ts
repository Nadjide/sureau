import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@/features/inventory/asset-schema'
import { AssetLocationActions } from './asset-location-actions'
import { defaultPlan } from './plan-document'
import { PlanTransferPanel } from './plan-transfer-panel'
import { RoomPlan } from './room-plan'
import { SpatialInspector } from './spatial-inspector'
import { SpatialViewer } from './spatial-viewer'
import { WorkstationEditor } from './workstation-editor'
import { createWorkspaceFromPlan } from './workspace-document'
import { WorkspaceTransferPanel } from './workspace-transfer-panel'

const asset: Asset = {
  id: 73, revision: 0, assetTag: 'SUREAU-0073', name: 'Casque accueil', serialNumber: null,
  brand: null, model: null, category: 'HEADSET', status: 'MAINTENANCE', purchaseDate: null,
  createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z',
}
const local = { locations: { 73: 'desk-01' }, warning: null, persisted: true, associate: vi.fn() }
const workspace = createWorkspaceFromPlan()

function viewer(editing: boolean, canEdit: boolean) {
  return renderToStaticMarkup(createElement(SpatialViewer, {
    plan: defaultPlan, canEdit, persisted: true, editing, onEditingChange: vi.fn(), onMove: vi.fn(),
    history: { canUndo: true, canRedo: true, undo: vi.fn(), redo: vi.fn() }, view: '2d', onViewChange: vi.fn(),
    selectedWorkstationId: 'desk-01', selectedIds: ['desk-01'], onSelectionChange: vi.fn(),
    onSelectWorkstation: vi.fn(), inspector: null, localizedCounts: {},
  }))
}

describe('outils spatiaux selon les permissions', () => {
  it('laisse un lecteur explorer le plan sans proposer d’édition ou de déplacement', () => {
    const markup = viewer(false, false)
    expect(markup).toContain('Plan 2D')
    expect(markup).toContain('Sélectionner un poste')
    expect(markup).toContain('Version enregistrée sur le serveur')
    expect(markup).not.toContain('>Modifier<')
    expect(markup).not.toContain('Annuler la dernière modification')
    expect(markup).not.toContain('Sélection multiple')
    expect(markup).not.toContain('room-plan is-editing')
    expect(markup).not.toContain('Glisser un objet')
  })

  it('permet de fermer un atelier suspendu sans réactiver ses outils', () => {
    const markup = viewer(true, false)
    expect(markup).toContain('Terminer')
    expect(markup).not.toContain('Aimantation à la grille')
    expect(markup).not.toContain('room-plan is-editing')
    expect(markup).not.toContain('Sélection des objets')
  })

  it('conserve les outils de composition pour un éditeur autorisé', () => {
    const markup = viewer(true, true)
    expect(markup).toContain('room-plan is-editing')
    expect(markup).toContain('Annuler la dernière modification')
    expect(markup).toContain('Sélection multiple')
  })

  it('le plan 2D applique aussi son propre verrou de permission', () => {
    const markup = renderToStaticMarkup(createElement(RoomPlan, {
      plan: defaultPlan, editing: true, canEdit: false, snap: true, onMove: vi.fn(),
      selectedWorkstationId: 'desk-01', selectedIds: ['desk-01'], multipleMode: true, onSelect: vi.fn(),
    }))
    expect(markup).not.toContain('room-plan is-editing')
    expect(markup).toContain('sélectionnables au clavier')
    expect(markup).not.toContain('Implantation locale')
  })

  it('bloque le changement de localisation tout en gardant la navigation et l’état serveur', () => {
    const markup = renderToStaticMarkup(createElement(AssetLocationActions, {
      asset, local, workspace, canEdit: false, onShowInPlan: vi.fn(),
    }))
    expect(markup).toMatch(/<select[^>]*disabled=""/)
    expect(markup).toContain('Voir dans le plan')
    expect(markup).toContain('Localisation enregistrée sur le serveur')
    expect(markup).not.toContain('dans ce navigateur')
  })

  it('ne propose pas au lecteur de retirer les localisations conservées', () => {
    const props: ComponentProps<typeof SpatialInspector> = {
      workspace, selectedWorkstationId: 'desk-01', selectedAssetId: null, canEdit: false,
      onSelectAsset: vi.fn(), onOpenInventory: vi.fn(), onShowInPlan: vi.fn(), local,
      inventory: { assets: [asset], status: 'ready', error: null, reload: vi.fn() },
    }
    const markup = renderToStaticMarkup(createElement(SpatialInspector, props))
    expect(markup).toContain('Casque accueil')
    expect(markup).toContain('Voir le matériel')
    expect(markup).not.toContain('Retirer la localisation')
    const details = renderToStaticMarkup(createElement(SpatialInspector, { ...props, selectedAssetId: 73 }))
    expect(details).toMatch(/<select[^>]*disabled=""/)
  })

  it('garde le formulaire de poste monté mais désactive ses saisies sans permission', () => {
    const markup = renderToStaticMarkup(createElement(WorkstationEditor, {
      plan: defaultPlan, canEdit: false, persisted: false, selectedId: 'desk-01', selectedIds: ['desk-01'],
      workspace, onChange: vi.fn(), onSelect: vi.fn(), onSelectionChange: vi.fn(),
      onWorkspaceChange: vi.fn(), onSelectionMoved: vi.fn(),
    }))
    expect(markup).toMatch(/<fieldset[^>]*disabled=""/)
    expect(markup).toContain('name="label"')
    expect(markup).toContain('Appliquer au poste')
    expect(markup).toContain('Vos saisies restent affichées')
    expect(markup).toContain('Enregistrez l’espace pour les partager')
    expect(markup).not.toContain('conservé dans ce navigateur')
  })

  it('garde l’export de plan disponible pour le lecteur et bloque import et réinitialisation', () => {
    const markup = renderToStaticMarkup(createElement(PlanTransferPanel, {
      plan: defaultPlan, canEdit: false, persisted: false, onChange: vi.fn(),
    }))
    const buttons = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)].map(([button]) => button)
    expect(buttons.find((button) => button.includes('Exporter le plan'))).not.toContain('disabled=""')
    expect(buttons.find((button) => button.includes('Importer un plan'))).toContain('disabled=""')
    expect(buttons.find((button) => button.includes('Partir d’un plateau vide'))).toContain('disabled=""')
    expect(buttons.find((button) => button.includes('Reprendre l’exemple initial'))).toContain('disabled=""')
    expect(markup).toContain('Brouillon à enregistrer')
  })

  it('garde l’export d’espace disponible en lecture seule sans annoncer de sauvegarde locale', () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceTransferPanel, {
      workspace, canEdit: false, persisted: true, onChange: vi.fn(), onImported: vi.fn(),
    }))
    const buttons = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)].map(([button]) => button)
    expect(buttons.find((button) => button.includes('Exporter l’espace'))).not.toContain('disabled=""')
    expect(buttons.find((button) => button.includes('Importer un espace'))).toContain('disabled=""')
    expect(markup).toContain('ne sont pas inclus dans le fichier')
    expect(markup).toContain('Version enregistrée sur le serveur')
    expect(markup).not.toContain('dans ce navigateur')
  })
})
