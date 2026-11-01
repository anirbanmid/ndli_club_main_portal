import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-3xl border border-[#E2ECE7] text-center space-y-6 shadow-sm animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#103125]">
              {this.props.fallbackTitle || 'Component Encountered an Unexpected State'}
            </h3>
            <p className="text-xs text-[#5A7366] max-w-md mx-auto">
              {this.state.error?.message || 'A runtime rendering issue occurred. Your session data remains safe.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-[#0D7751] text-white text-xs font-bold hover:bg-[#103125] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry / Reload</span>
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-xl border border-[#E2ECE7] bg-white text-[#2E4A3E] text-xs font-bold hover:bg-[#F4F8F6] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4 text-[#5A7366]" />
              <span>Back to Home</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
