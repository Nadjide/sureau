import './zod-config'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SessionProvider } from '@/features/auth/session-provider'
import { AuthGate } from '@/features/auth/auth-gate'
import { LazyPanel } from '@/components/lazy-panel'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/brand'

const loadApplication = () => import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider><AuthGate><LazyPanel load={loadApplication} panelProps={{}}
      loading={<div className="auth-application-status" role="status"><Brand /><p>Ouverture de votre atelier…</p></div>}
      failure={(retry) => <div className="auth-application-status" role="alert"><Brand /><p>Votre atelier n’a pas pu être chargé.</p><Button variant="outline" onClick={retry}>Réessayer le chargement</Button></div>}
    /></AuthGate></SessionProvider>
  </StrictMode>,
)
