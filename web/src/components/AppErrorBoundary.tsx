import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#06060f] px-4 py-8 text-center">
          <p
            className="text-[10px] text-pink-400 sm:text-xs"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            SOMETHING BROKE
          </p>
          <pre className="max-h-40 max-w-full overflow-auto rounded border border-red-500/30 bg-slate-950/80 p-3 text-left text-xs text-amber-200/90">
            {this.state.error.message}
          </pre>
          <Button
            type="button"
            className="font-['Press_Start_2P',monospace] text-[9px] uppercase tracking-wider"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
