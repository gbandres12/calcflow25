import React from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

type Props = { children: React.ReactNode; label?: string; onReset?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label || 'view', error, errorInfo);
    try {
      Sentry.captureException(error, {
        tags: { boundary: this.props.label || 'view' },
        extra: { componentStack: errorInfo?.componentStack }
      });
    } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-6 sm:p-8 text-rose-950 shadow-sm max-w-2xl mx-auto my-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-rose-950">Falha ao carregar esta seção</h2>
              <p className="text-xs text-rose-700 font-mono">
                {this.props.label ? `Módulo: ${this.props.label}` : 'Visualização'}
              </p>
            </div>
          </div>
          <p className="text-sm font-medium text-rose-900 bg-white/70 border border-rose-200/60 rounded-xl p-3 font-mono text-xs break-all mb-4">
            {this.state.error.message || 'Erro inesperado'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-900 hover:bg-rose-950 text-white text-xs font-bold transition-colors"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              <RefreshCw size={14} />
              Tentar recarregar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-rose-200 hover:bg-rose-100 text-rose-900 text-xs font-bold transition-colors"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/dashboard';
                }
              }}
            >
              <Home size={14} />
              Ir para o Início
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
