/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import axios from "axios";
import "./styles/globals.css";

// import { useAuth } from "./hooks/useAuth";
import { useAuth } from "./AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AuthProvider } from "./AuthContext";
import { WebSocketProvider } from "./WebSocketContext";
import { getCsrfToken } from "./lib/csrf";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { PixiLoaderPersistent } from "./components/PixiLoaderPersistent";
import { router } from "./router";

// Attach CSRF token to all state-changing axios requests
axios.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (method && !["get", "head", "options"].includes(method)) {
    const token = getCsrfToken();
    if (token) {
      config.headers["X-CSRF-Token"] = token;
    }
  }
  return config;
});

const queryClient = new QueryClient();

function AppRouter() {
  const authentication = useAuth();

  return (
    <RouterProvider router={router} context={{ authentication, queryClient }} />
  );
}

function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <AppErrorBoundary>
            {/* Same bg as Pixi shell — deploy splash lives in `__root.tsx` so /login is never blocked */}
            <div className="min-h-dvh bg-[#06060f]">
              <Suspense fallback={<PixiLoaderPersistent />}>
                <AppRouter />
              </Suspense>
            </div>
          </AppErrorBoundary>
        </WebSocketProvider>
      </AuthProvider>

      {import.meta.env.DEV ? <ReactQueryDevtools /> : null}
    </QueryClientProvider>
  );
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
} else if (import.meta.env.DEV) {
  console.warn(
    "main: #root was non-empty; skipping createRoot (possible duplicate boot)",
    rootElement.innerHTML.length,
  );
}

