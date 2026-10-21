import { Badge } from '@/components/ui/badge'
import { Brand } from '@/components/brand'

function App() {
  return (
    <main className="welcome">
      <Brand />
      <Badge variant="secondary">ATELIER SPATIAL</Badge>
      <h1>Le parc prend forme.</h1>
      <p>Votre matériel. Vos espaces. Une même vue.</p>
      <div className="welcome-foot">L’espace d’exploration se prépare.</div>
    </main>
  )
}

export default App
