import { useState, type ReactNode } from 'react'
import {
  Building2,
  CircleHelp,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import type { WorkspaceDocument } from '@/features/spatial/workspace-document'
import { AccountMenu, type WorkspaceDepartureGuard } from '@/features/auth/account-menu'
import { roleLabels } from '@/features/auth/session-state'
import { useSession } from '@/features/auth/use-session'
import { useGuideIntroduction } from '@/features/guide/use-guide-introduction'
import { GuideIntroduction, UserGuide } from '@/features/guide/user-guide'
import { msg, plural, t } from '@/lib/i18n'

export type WorkspaceTab = 'spaces' | 'inventory'

type AppShellProps = {
  workspace: WorkspaceDocument | null
  activeRoomId: string
  onRoomChange: (id: string) => void
  onManageSpaces: () => void
  tab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
  departureGuard?: WorkspaceDepartureGuard
  children: ReactNode
}

const tabs = [
  { id: 'spaces', label: msg('Espaces'), icon: LayoutGrid },
  { id: 'inventory', label: msg('Matériel'), icon: Monitor },
] as const

function SpaceNavigation({
  workspace,
  activeRoomId,
  active,
  onSelect,
  onManage,
  canManage,
}: {
  workspace: WorkspaceDocument | null
  activeRoomId: string
  active: boolean
  onSelect: (id: string) => void
  onManage: () => void
  canManage: boolean
}) {
  return (
    <>
      <p className="sidebar-section-label">{t('MES ESPACES')}</p>
      <nav className="space-tree min-h-0 flex-1 overflow-y-auto" aria-label={t('Salles de l’espace de travail')}>
        {workspace ? (
          <>
            <div className="space-tree-item space-tree-root">
              <Building2 size={16} aria-hidden="true" />
              <span
                className="space-tree-title"
                style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
              >
                {workspace.name}
              </span>
            </div>
            <ul className="space-floor-list">
              {workspace.floors.map((floor) => {
                const rooms = workspace.rooms.filter((room) => room.floorId === floor.id)
                return (
                  <li key={floor.id} className="space-floor">
                    <div className="space-tree-item space-floor-label">
                      <Layers size={15} aria-hidden="true" />
                      <span
                        className="space-tree-title"
                        style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                      >
                        {floor.name}
                      </span>
                      <span
                        className="space-room-count shrink-0"
                        aria-label={plural(rooms.length, '{count} salle', '{count} salles')}
                      >
                        {rooms.length}
                      </span>
                    </div>
                    <ul
                      className="space-tree-indent space-room-list"
                      aria-label={t('Salles de {floor}', { floor: floor.name })}
                    >
                      {rooms.map(({ plan }) => {
                        const current = active && activeRoomId === plan.id
                        return (
                          <li key={plan.id}>
                            <button
                              type="button"
                              className={`space-tree-item space-room-button${current ? ' is-current' : ''}`}
                              aria-current={current ? 'page' : undefined}
                              aria-label={t('Ouvrir {room}, {floor}', { room: plan.name, floor: floor.name })}
                              onClick={() => onSelect(plan.id)}
                            >
                              <PanelTop size={16} aria-hidden="true" />
                              <span
                                className="space-tree-title"
                                style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                              >
                                {plan.name}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <div className="space-tree-item space-tree-root items-start">
            <Building2 size={16} aria-hidden="true" />
            <div className="min-w-0">
              <span className="space-tree-title">{t('Vos espaces partagés')}</span>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t('Ouvrez Espaces pour consulter le chargement ou préparer votre atelier.')}
              </p>
            </div>
          </div>
        )}
      </nav>
      {workspace && canManage && (
        <Button variant="outline" className="space-management-button my-4 w-full shrink-0" onClick={onManage}>
          <Settings2 aria-hidden="true" />
          {t('Gérer les espaces')}
        </Button>
      )}
      <div className="sidebar-note">
        <span>{t('ATELIER PARTAGÉ')}</span>
        <p>{t('Enregistrez vos salles et vos localisations pour les retrouver sur le serveur de cette instance.')}</p>
      </div>
    </>
  )
}

export function AppShell({
  tab,
  onTabChange,
  children,
  workspace,
  activeRoomId,
  onRoomChange,
  onManageSpaces,
  departureGuard,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const introduction = useGuideIntroduction()
  const { theme, toggleTheme } = useTheme()
  const { state, canEdit } = useSession()
  const themeLabel = theme === 'dark' ? t('Passer au thème clair') : t('Passer au thème sombre')

  function openGuide() {
    introduction.dismiss()
    setGuideOpen(true)
  }

  function navigate(nextTab: WorkspaceTab) {
    onTabChange(nextTab)
    setMenuOpen(false)
  }

  function chooseRoom(id: string) {
    if (!workspace?.rooms.some((room) => room.plan.id === id)) return
    onRoomChange(id)
    navigate('spaces')
  }

  function manageSpaces() {
    if (!workspace || !canEdit) return
    onManageSpaces()
    setMenuOpen(false)
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="app-shell">
        <a className="skip-link" href="#workspace-main">
          {t('Aller au contenu')}
        </a>

        <header className="app-header">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label={t('Ouvrir le menu de navigation')}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-72">
              <SheetHeader>
                <SheetTitle>{t('Votre espace Sureau')}</SheetTitle>
                <SheetDescription>{t('Parcourir les espaces et le matériel.')}</SheetDescription>
              </SheetHeader>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3"
                  aria-label={t('Fermer le menu de navigation')}
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
              <nav className="mobile-navigation flex flex-col gap-1 px-4" aria-label={t('Navigation mobile')}>
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`app-nav-item${tab === id ? ' is-active' : ''}`}
                    aria-current={tab === id ? 'page' : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {t(label)}
                  </button>
                ))}
              </nav>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <SpaceNavigation
                  workspace={workspace}
                  activeRoomId={activeRoomId}
                  active={tab === 'spaces'}
                  onSelect={chooseRoom}
                  onManage={manageSpaces}
                  canManage={canEdit}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="app-brand">
            <Brand />
          </div>
          <nav className="app-nav" aria-label={t('Navigation principale')}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`app-nav-item${tab === id ? ' is-active' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={15} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </nav>
          <div className="header-spacer" />
          <span className="app-header-meta">
            {state.user ? t(roleLabels[state.user.role]).toLocaleUpperCase() : t('VOTRE ESPACE')}
          </span>
          <Button variant="ghost" size="sm" className="guide-button" onClick={openGuide}>
            <CircleHelp aria-hidden="true" />
            <span className="guide-button-label">{t('Guide')}</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={themeLabel}>
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {themeLabel}
            </TooltipContent>
          </Tooltip>
          <AccountMenu {...(departureGuard ? { departureGuard } : {})} />
        </header>

        <div className="app-body">
          <aside className="space-sidebar" aria-label={t('Vos espaces')}>
            <SpaceNavigation
              workspace={workspace}
              activeRoomId={activeRoomId}
              active={tab === 'spaces'}
              onSelect={chooseRoom}
              onManage={manageSpaces}
              canManage={canEdit}
            />
          </aside>
          <main id="workspace-main" className="workspace-main" tabIndex={-1}>
            {introduction.visible && <GuideIntroduction onOpen={openGuide} onDismiss={introduction.dismiss} />}
            {children}
          </main>
        </div>

        <footer className="app-footer">
          <span>SUREAU</span>
          <span>{t('Le matériel, dans son espace.')}</span>
        </footer>
        {guideOpen && state.user && <UserGuide role={state.user.role} onClose={() => setGuideOpen(false)} />}
      </div>
    </TooltipProvider>
  )
}
