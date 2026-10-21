import { useState, type ReactNode } from 'react'
import {
  Building2,
  ChevronDown,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  PanelTop,
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

export type WorkspaceTab = 'spaces' | 'inventory'

type AppShellProps = {
  tab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
  children: ReactNode
}

const tabs = [
  { id: 'spaces', label: 'Espaces', icon: LayoutGrid },
  { id: 'inventory', label: 'Matériel', icon: Monitor },
] as const

function SpaceNavigation({
  active,
  onSelect,
}: {
  active: boolean
  onSelect: () => void
}) {
  return (
    <>
      <p className="sidebar-section-label">MES ESPACES</p>
      <nav className="space-tree" aria-label="Plans locaux">
        <div className="space-tree-item">
          <ChevronDown size={13} aria-hidden="true" />
          <Building2 size={16} aria-hidden="true" />
          <span>Espace de travail</span>
        </div>
        <div className="space-tree-indent">
          <button
            type="button"
            className={`space-tree-item${active ? ' is-current' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={onSelect}
          >
            <PanelTop size={16} aria-hidden="true" />
            <span>Plateau A</span>
          </button>
        </div>
      </nav>
      <div className="sidebar-note">
        <span>EXEMPLE LOCAL</span>
        <p>Un plan d’exemple pour explorer votre futur espace.</p>
      </div>
    </>
  )
}

export function AppShell({ tab, onTabChange, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const themeLabel = theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'

  function navigate(nextTab: WorkspaceTab) {
    onTabChange(nextTab)
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
              <div className="mt-4 px-4">
                <SpaceNavigation active={tab === 'spaces'} onSelect={() => navigate('spaces')} />
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
            <SpaceNavigation active={tab === 'spaces'} onSelect={() => navigate('spaces')} />
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
