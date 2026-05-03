import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Outlet } from "@tanstack/react-router";
import { ensureGuestSession } from "@/api/fetchUser";
import { PixiLoaderPersistent } from "@/components/PixiLoaderPersistent";

export const Route = createFileRoute("/_authenticated")({
  component: RouteComponent,
  /** Shown while `beforeLoad` resolves session — avoids an empty outlet under the header */
  pendingComponent: () => <PixiLoaderPersistent />,
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: async ({ context, location }) => {
    try {
      await ensureGuestSession(context.queryClient);
    } catch {
      redirect({
        to: "/login",
        search: { redirect: location.href },
        throw: true,
      });
    }
  },
});

function RouteComponent() {
  return <Outlet />;
}
