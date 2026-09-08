import React from 'react';

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', this.props.label || 'view', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h2 className="text-lg font-black mb-2">Esta tela quebrou</h2>
          <p className="text-sm font-medium mb-3">{this.state.error.message}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
            onClick={() => this.setState({ error: null })}
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
