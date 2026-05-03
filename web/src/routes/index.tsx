import { PixiLoaderPersistent } from "@/components/PixiLoaderPersistent";
import { createFileRoute, redirect } from "@tanstack/react-router";

/** App entry → `/play` (guest session is ensured in `_authenticated` beforeLoad). */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/play",
      replace: true,
    });
  },
  pendingComponent: () => <PixiLoaderPersistent />,
  /** Never render empty outlet if `/` matches before redirect settles */
  component: () => <PixiLoaderPersistent />,
});
