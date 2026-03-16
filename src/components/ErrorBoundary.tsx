import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4">
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold text-red-400 mb-2">Qualcosa è andato storto</h2>
            <p className="text-gray-300 mb-4">
              C'è stato un errore imprevisto nell'applicazione.
            </p>
            <pre className="bg-black/50 p-4 rounded text-sm text-red-300 overflow-auto whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
            >
              Ricarica la pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
