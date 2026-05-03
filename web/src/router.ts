import { createElement } from "react";
import { createRouter } from "@tanstack/react-router";
import { PixiLoaderPersistent } from "./components/PixiLoaderPersistent";
import { routeTree } from "./routeTree.gen";

/**
 * Single router instance shared by `RouterProvider` and code outside the provider
 * (e.g. Auth mutations must call navigate/invalidate without `useRouter`).
 */
export const router = createRouter({
  routeTree,
  /** Fills the gap after boot splash while async `beforeLoad` / loaders run (no blank outlet). */
  defaultPendingComponent: () => createElement(PixiLoaderPersistent),
  context: {
    authentication: undefined!,
    queryClient: undefined!,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
