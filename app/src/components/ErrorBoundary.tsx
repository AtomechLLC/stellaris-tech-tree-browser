import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/commit errors from the graph subtree (the Sigma/WebGL mount
 * is the one place a runtime error can escape — an uncaught error there would
 * otherwise unmount the entire React root and leave a blank page with no
 * recovery). Renders a recoverable fallback instead of the blank-page-of-death
 * (code review recommendation for Phase 2).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // Surface the real error even in production builds (where React swallows
    // the console warning) so failures are diagnosable, not silent.
    console.error("[ErrorBoundary] render error:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
