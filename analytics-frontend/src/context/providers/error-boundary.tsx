import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Part 7 §7.16 — outermost provider. A crash in any provider below this
// (QueryClient, Jotai, Router) must not render a blank white screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-dvh items-center justify-center bg-background p-6 text-center">
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground">Please reload the page.</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
