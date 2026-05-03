import { useState } from "react";
import { AuthContextType, useAuth } from "@/AuthContext";
import { Button } from "@/components/ui/button";
import { QueryClient } from "@tanstack/react-query";
import { DeployLoadingOverlay } from "@/components/DeployLoadingOverlay";
import {
  isDeploySplashComplete,
  markDeploySplashComplete,
} from "@/lib/deploySplash";

import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { HeadContent } from "@tanstack/react-router";

interface RouterContext {
  authentication: AuthContextType;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

function Root() {
  const auth = useAuth();
  const [splashDismissedUi, setSplashDismissedUi] = useState(
    () => isDeploySplashComplete(),
  );

  // Show the deploy loading console on every first paint (including /login) until the user
  // finishes it once per tab — same as production “loading → then app” flow.
  const showDeploySplash = !splashDismissedUi;

  const onDeploySplashDone = () => {
    markDeploySplashComplete();
    setSplashDismissedUi(true);
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#06060f]">
      {showDeploySplash ? (
        <DeployLoadingOverlay onComplete={onDeploySplashDone} />
      ) : null}
      <HeadContent />
      <header className="shrink-0 border-b border-gray-700 bg-gray-800 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-6 min-w-0">
            <Link
              to="/play"
              className="text-xl font-bold text-white hover:text-gray-300 transition-colors whitespace-nowrap"
            >
              Dots & Boxes
            </Link>

            {/* Navigation Links */}
            <nav className="hidden sm:flex gap-4">
              <Link
                to="/play"
                className="text-gray-300 hover:text-white transition-colors [&.active]:text-white [&.active]:font-semibold"
              >
                Play
              </Link>
              <Link
                to="/leaderboard"
                className="text-gray-300 hover:text-white transition-colors [&.active]:text-white [&.active]:font-semibold"
              >
                Leaderboard
              </Link>
              {auth.isAuthenticated && (
                <Link
                  to="/play"
                  search={{ create: "1" }}
                  className="text-gray-300 hover:text-white transition-colors [&.active]:text-white [&.active]:font-semibold"
                >
                  Create lobby
                </Link>
              )}
              {auth.isAuthenticated && (
                <Link
                  to="/history"
                  className="text-gray-300 hover:text-white transition-colors [&.active]:text-white [&.active]:font-semibold"
                >
                  History
                </Link>
              )}
              <Link
                to="/about"
                className="text-gray-300 hover:text-white transition-colors [&.active]:text-white [&.active]:font-semibold"
              >
                About
              </Link>
            </nav>
          </div>

          {/* Auth Section */}
          <div className="flex shrink-0 items-center gap-3">
            {auth.loading ? (
              <div className="flex gap-2">
                <Button disabled variant="outline" size="sm">
                  Loading...
                </Button>
              </div>
            ) : auth.isAuthenticated ? (
              <>
                <span className="text-gray-400 text-sm hidden sm:inline">
                  Welcome back!
                </span>
                <Button onClick={auth.logout} variant="destructive" size="sm">
                  Logout
                </Button>
              </>
            ) : (
              <Link to="/play">
                <Button variant="default" size="sm">
                  Play
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col bg-[#06060f]">
        <Outlet />
      </main>

      {/* Solid-based panel can throw (e.g. suspense.effects undefined) with React 19 + Suspense */}
      {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
    </div>
  );
}
