import { useAuth } from "@/AuthContext";
import { AuthForm } from "@/components/AuthForm";
import { FunkyNamePixelBanner } from "@/components/FunkyNamePixelBanner";
import {
  createFileRoute,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import z from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { fetchUser } from "@/api/fetchUser";

const fallback = "/play" as const;

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
  beforeLoad: async ({ context, search }) => {
    let user;
    try {
      user = await context.queryClient.ensureQueryData({
        queryKey: ["me"],
        queryFn: fetchUser,
      });
    } catch {
      user = null;
    }

    if (user) {
      redirect({ to: search.redirect ?? fallback, throw: true });
    }
  },
  component: Login,
  head: () => ({
    meta: [
      {
        title: "Play as guest - Dots & Boxes Online",
      },
      {
        name: "description",
        content:
          "Pick a name and jump into Dots & Boxes multiplayer as a guest.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dotsandboxesonline.com/login",
      },
    ],
  }),
});

function Login() {
  const { loginAsGuest } = useAuth();
  const search = Route.useSearch();
  const router = useRouter();
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const navigate = Route.useNavigate();

  async function onGuestJumpIn(username: string) {
    await loginAsGuest(username);
    await router.invalidate();
    await navigate({ to: search.redirect ?? fallback, replace: true });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#06060f]">
      <FunkyNamePixelBanner />

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="border-gray-700 bg-gray-800">
            <CardContent className="pt-8 pb-6">
              <AuthForm
                onSubmitHandler={async () => {}}
                isLoading={isLoading}
                buttonText="Login"
                formType="login"
                loginLayout="funky"
                guestOnly
                onGuestJumpIn={onGuestJumpIn}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
