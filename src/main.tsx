import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Prevent third-party browser extension errors (e.g., MetaMask provider injection) from bubbling
window.addEventListener(
  'unhandledrejection',
  (event) => {
    const reason = event.reason;
    const reasonStr = (
      reason?.message ||
      reason?.stack ||
      (typeof reason === 'string' ? reason : '') ||
      JSON.stringify(reason || {})
    ).toLowerCase();

    if (
      reasonStr.includes('metamask') ||
      reasonStr.includes('failed to connect to metamask') ||
      reasonStr.includes('ethereum') ||
      reasonStr.includes('eip6963') ||
      reasonStr.includes('chrome-extension://') ||
      reasonStr.includes('moz-extension://') ||
      reasonStr.includes('safari-web-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      console.warn('Suppressed external browser extension rejection:', reason);
    }
  },
  true
);

window.addEventListener(
  'error',
  (event) => {
    const msg = (
      event.message ||
      event.filename ||
      (typeof event.error === 'string' ? event.error : event.error?.message || '')
    ).toLowerCase();

    if (
      msg.includes('metamask') ||
      msg.includes('failed to connect to metamask') ||
      msg.includes('ethereum') ||
      msg.includes('eip6963') ||
      msg.includes('chrome-extension://') ||
      msg.includes('moz-extension://') ||
      msg.includes('safari-web-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      console.warn('Suppressed external browser extension error:', event.message);
    }
  },
  true
);

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('FUHSI Connect App ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center mx-auto text-xl font-black">
              🏥
            </div>
            <h2 className="text-lg font-black text-slate-900">FUHSI Connect Notice</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Something went temporary wrong loading this view. You can refresh or return to home feed.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="w-full py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs transition-all shadow-md cursor-pointer"
            >
              Return to Campus Feed
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

