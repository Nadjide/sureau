import { Component, type ReactNode } from 'react'
import { Box } from 'lucide-react'
import { Button } from '@/components/ui/button'

export class SceneBoundary extends Component<{ children: ReactNode; onFallback: () => void; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch() { this.props.onFailure() }

  render() {
    if (this.state.failed) return <div className="scene-fallback" role="status"><Box size={28} strokeWidth={1.2} /><h2>Le plan reste accessible.</h2><p>La vue 3D n’a pas pu démarrer sur cet appareil.</p><Button variant="outline" onClick={this.props.onFallback}>Ouvrir le plan 2D</Button></div>
    return this.props.children
  }
}
