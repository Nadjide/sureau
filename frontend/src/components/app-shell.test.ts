import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import { sessionPermissions, type SessionState } from '@/features/auth/session-state'
import { createWorkspaceFromPlan, type WorkspaceDocument } from '@/features/spatial/workspace-document'
import { AppShell } from './app-shell'

function render(workspace: WorkspaceDocument | null, role: 'ADMIN' | 'EDITOR' | 'VIEWER' = 'ADMIN', expired = false): string {
  const state: SessionState = {
    phase: expired ? 'expired' : 'authenticated', generation: 0, error: null,
    user: { id: 42, username: 'equipe', displayName: 'Équipe Atelier', role },
  }
  const session: SessionContextValue = {
    state, ...sessionPermissions(state), busy: false,
    login: vi.fn().mockResolvedValue(undefined), setup: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined), refresh: vi.fn(),
    expire: vi.fn(), updateUser: vi.fn(),
  }
  const shellProps = {
    workspace, activeRoomId: workspace?.rooms[0]?.plan.id ?? '', tab: 'inventory' as const,
    onRoomChange: vi.fn(), onManageSpaces: vi.fn(), onTabChange: vi.fn(),
    children: createElement('p', null, 'Inventaire du serveur'),
  }
  return renderToStaticMarkup(createElement(SessionContext, { value: session }, createElement(AppShell, shellProps)))
}

describe('navigation de l’atelier partagé', () => {
  it('garde l’inventaire accessible sans afficher de salle fictive quand aucun espace n’est chargé', () => {
    const markup = render(null)

    expect(markup).toContain('aria-label="Navigation principale"')
    expect(markup).toContain('Matériel')
    expect(markup).toContain('Inventaire du serveur')
    expect(markup).toContain('Vos espaces partagés')
    expect(markup).not.toContain('Étage 1')
    expect(markup).not.toContain('Gérer les espaces')
    expect(markup).not.toContain('ATELIER LOCAL')
  })

  it('permet à un lecteur de parcourir les vraies salles sans lui proposer la gestion des espaces', () => {
    const workspace = createWorkspaceFromPlan()
    workspace.name = 'Entreprise Horizon'
    workspace.floors[0]!.name = 'Rez-de-chaussée'
    workspace.rooms[0]!.plan.name = 'Accueil'
    const markup = render(workspace, 'VIEWER')

    expect(markup).toContain('Entreprise Horizon')
    expect(markup).toContain('Rez-de-chaussée')
    expect(markup).toContain('aria-label="Ouvrir Accueil, Rez-de-chaussée"')
    expect(markup).toContain('ATELIER PARTAGÉ')
    expect(markup).not.toContain('Gérer les espaces')
    expect(markup).not.toContain('restent dans ce navigateur')
  })

  it.each(['ADMIN', 'EDITOR'] as const)('propose la gestion aux comptes %s lorsqu’un espace est chargé', (role) => {
    expect(render(createWorkspaceFromPlan(), role)).toContain('Gérer les espaces')
  })

  it('retire la gestion des espaces lorsque la session administrateur a expiré', () => {
    const markup = render(createWorkspaceFromPlan(), 'ADMIN', true)

    expect(markup).toContain('Matériel')
    expect(markup).not.toContain('Gérer les espaces')
  })
})
