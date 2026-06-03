import React from "react";

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Any uncaught render error renders a recovery screen
 * instead of a blank white page.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center font-sans">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-950/40 text-2xl">
          ⚠
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-100">Something went wrong</h1>
          <p className="mt-1 text-sm text-slate-400">
            An unexpected error occurred. Your uploaded files are safe — click below to try recovering.
          </p>
        </div>
        <pre className="max-h-40 w-full max-w-xl overflow-auto rounded-lg border border-white/[0.08] bg-black/60 p-3 text-left font-mono text-[10px] text-rose-300/80">
          {error.message}
        </pre>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/50"
          >
            Try to recover
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]"
          >
            Hard reload
          </button>
        </div>
      </div>
    );
  }
}
