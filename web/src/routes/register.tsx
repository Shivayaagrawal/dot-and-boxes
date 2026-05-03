import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

/** Registration is disabled; send users to the guest entry screen. */
export const Route = createFileRoute("/register")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/login",
      search: { redirect: search.redirect },
      replace: true,
    });
  },
});
