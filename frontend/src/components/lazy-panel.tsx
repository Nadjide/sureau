import { Component, createElement, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react'

interface BoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

class PanelBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface Props<PanelProps extends object> {
  load: () => Promise<{ default: ComponentType<PanelProps> }>
  panelProps: PanelProps
  loading: ReactNode
  failure: (retry: () => void) => ReactNode
}

export function LazyPanel<PanelProps extends object>({ load, panelProps, loading, failure }: Props<PanelProps>) {
  const [attempt, setAttempt] = useState(() => ({ id: 0, Panel: lazy(load) }))
  function retry() {
    setAttempt((current) => ({ id: current.id + 1, Panel: lazy(load) }))
  }

  return <PanelBoundary key={attempt.id} fallback={failure(retry)}>
    <Suspense fallback={loading}>{createElement(attempt.Panel, panelProps)}</Suspense>
  </PanelBoundary>
}
