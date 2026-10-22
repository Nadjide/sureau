import { useState, type ReactNode } from 'react'
import {
  Building2,
  Layers,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  PanelTop,
  Settings2,
  Sun,
  X,
} from 'lucide-react'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import type { WorkspaceDocument } from '@/features/spatial/workspace-document'

export type WorkspaceTab = 'spaces' | 'inventory'

type AppShellProps = {
  workspace: WorkspaceDocument
  activeRoomId: string
  onRoomChange: (id: string) => void
  onManageSpaces: () => void
  tab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
  children: ReactNode
}

const tabs = [
  { id: 'spaces', label: 'Espaces', icon: LayoutGrid },
  { id: 'inventory', label: 'Matériel', icon: Monitor },
] as const

function SpaceNavigation({
  workspace,
  activeRoomId,
  active,
  onSelect,
  onManage,
}: {
  workspace: WorkspaceDocument
  activeRoomId: string
  active: boolean
  onSelect: (id: string) => void
  onManage: () => void
}) {
  return (
    <>
      <p className="sidebar-section-label">MES ESPACES</p>
      <nav className="space-tree min-h-0 flex-1 overflow-y-auto" aria-label="Salles de l’espace de travail">
        <div className="space-tree-item space-tree-root">
          <Building2 size={16} aria-hidden="true" />
          <span className="space-tree-title" style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{workspace.name}</span>
        </div>
        <ul className="space-floor-list">
          {workspace.floors.map((floor) => {
            const rooms = workspace.rooms.filter((room) => room.floorId === floor.id)
            return <li key={floor.id} className="space-floor">
              <div className="space-tree-item space-floor-label">
                <Layers size={15} aria-hidden="true" />
                <span className="space-tree-title" style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{floor.name}</span>
                <span className="space-room-count shrink-0" aria-label={`${rooms.length} salle${rooms.length > 1 ? 's' : ''}`}>{rooms.length}</span>
              </div>
              <ul className="space-tree-indent space-room-list" aria-label={`Salles de ${floor.name}`}>
                {rooms.map(({ plan }) => {
                  const current = active && activeRoomId === plan.id
                  return <li key={plan.id}>
                    <button
                      type="button"
                      className={`space-tree-item space-room-button${current ? ' is-current' : ''}`}
                      aria-current={current ? 'page' : undefined}
                      aria-label={`Ouvrir ${plan.name}, ${floor.name}`}
                      onClick={() => onSelect(plan.id)}
                    >
                      <PanelTop size={16} aria-hidden="true" />
                      <span className="space-tree-title" style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{plan.name}</span>
                    </button>
                  </li>
                })}
              </ul>
            </li>
          })}
        </ul>
      </nav>
      <Button variant="outline" className="space-management-button my-4 w-full shrink-0" onClick={onManage}>
        <Settings2 aria-hidden="true" />Gérer les espaces
      </Button>
      <div className="sidebar-note">
        <span>ATELIER LOCAL</span>
        <p>Vos salles et vos localisations restent dans ce navigateur.</p>
      </div>
    </>
  )
}

export function AppShell({ tab, onTabChange, children, workspace, activeRoomId, onRoomChange, onManageSpaces }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const themeLabel = theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'

  function navigate(nextTab: WorkspaceTab) {
    onTabChange(nextTab)
    setMenuOpen(false)
  }

  function chooseRoom(id: string) {
    onRoomChange(id)
    navigate('spaces')
  }

  function manageSpaces() {
    onManageSpaces()
    setMenuOpen(false)
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="app-shell">
        <a className="skip-link" href="#workspace-main">Aller au contenu</a>

        <header className="app-header">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label="Ouvrir le menu de navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-72">
              <SheetHeader>
                <SheetTitle>Votre espace Sentinel</SheetTitle>
                <SheetDescription>Parcourir les espaces et le matériel.</SheetDescription>
              </SheetHeader>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3"
                  aria-label="Fermer le menu de navigation"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
              <nav className="mobile-navigation flex flex-col gap-1 px-4" aria-label="Navigation mobile">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`app-nav-item${tab === id ? ' is-active' : ''}`}
                    aria-current={tab === id ? 'page' : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </nav>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <SpaceNavigation workspace={workspace} activeRoomId={activeRoomId} active={tab === 'spaces'} onSelect={chooseRoom} onManage={manageSpaces} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="app-brand"><Brand /></div>
          <nav className="app-nav" aria-label="Navigation principale">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`app-nav-item${tab === id ? ' is-active' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <div className="header-spacer" />
          <span className="app-header-meta">ESPACE PERSONNEL</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={themeLabel}>
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>{themeLabel}</TooltipContent>
          </Tooltip>
          <span className="user-avatar" role="img" aria-label="Nadjide Omar">NO</span>
        </header>

        <div className="app-body">
          <aside className="space-sidebar" aria-label="Vos espaces">
            <SpaceNavigation workspace={workspace} activeRoomId={activeRoomId} active={tab === 'spaces'} onSelect={chooseRoom} onManage={manageSpaces} />
          </aside>
          <main id="workspace-main" className="workspace-main" tabIndex={-1}>
            {children}
          </main>
        </div>

        <footer className="app-footer">
          <span>SENTINEL</span>
          <span>Le matériel, dans son espace.</span>
        </footer>
      </div>
    </TooltipProvider>
  )
}
