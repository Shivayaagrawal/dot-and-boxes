import { ensureGuestSession, fetchUser } from "@/api/fetchUser";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/join/$lobbyID")({
  beforeLoad: async ({ context, params }) => {
    let user: Awaited<ReturnType<typeof fetchUser>> | null = null;
    try {
      user = await context.queryClient.ensureQueryData({
        queryKey: ["me"],
        queryFn: fetchUser,
      });
    } catch {
      user = null;
    }

    if (!user) {
      try {
        await ensureGuestSession(context.queryClient);
      } catch {
        throw redirect({
          to: "/login",
          search: { redirect: `/join/${params.lobbyID}` },
        });
      }
    }

    throw redirect({
      to: "/lobby/$lobbyID",
      params: { lobbyID: params.lobbyID },
    });
  },
  component: () => null,
});
