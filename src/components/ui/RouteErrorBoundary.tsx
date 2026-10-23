import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
};

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 space-y-3">
          <p className="text-sm font-black uppercase tracking-widest text-red-600">
            {this.props.title ?? 'Seite konnte nicht geladen werden'}
          </p>
          <p className="text-xs text-[var(--text-muted)] font-medium break-words">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl ui-btn-brand text-[10px] font-black uppercase tracking-widest"
          >
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
