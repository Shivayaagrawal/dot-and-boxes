import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import React, { useState } from "react";
import axios from "axios";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FUNKY_NAME_SUGGESTIONS } from "@/lib/funkyNameSuggestions";

const loginSchema = z.object({
  username: z
    .string()
    .min(2, { message: "Username must have at least 2 characters" })
    .max(50),
  password: z.string().min(5, {
    message: "Password must be at least 5 characters.",
  }),
});

const funkyGuestUsername = z
  .string()
  .trim()
  .min(3, { message: "Use at least 3 characters for your funky name." })
  .max(20, { message: "Max 20 characters." })
  .regex(/^[a-zA-Z0-9_]+$/, {
    message: "Letters, numbers, and underscores only.",
  });

interface AuthFormProps {
  onSubmitHandler: (values: z.infer<typeof loginSchema>) => Promise<void>;
  isLoading?: boolean;
  buttonText?: string;
  formType: "login" | "register";
  /** Login screen: game-style chips + “jump in” guest path */
  loginLayout?: "default" | "funky";
  onGuestJumpIn?: (username: string) => Promise<void>;
  /** Hide password and registered sign-in (guest jump-in only). */
  guestOnly?: boolean;
}

export function AuthForm({
  onSubmitHandler,
  isLoading = false,
  buttonText = "Submit",
  formType,
  loginLayout = "default",
  onGuestJumpIn,
  guestOnly = false,
}: AuthFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  function getErrorMessage(err: unknown): string {
    if (
      axios.isAxiosError(err) &&
      typeof err.response?.data?.message === "string"
    ) {
      return err.response.data.message;
    }
    if (axios.isAxiosError(err) && typeof err.response?.data === "string") {
      const raw = err.response.data;
      if (/^\s*<!DOCTYPE html/i.test(raw) || /<\/html>\s*$/i.test(raw)) {
        return "Could not reach the game server. If you are on Vercel, check that /api is rewritten to your Render backend (see vercel.json).";
      }
      if (raw.length > 280) {
        return err.response?.status === 404
          ? "Game server returned 404 — API URL or proxy may be misconfigured."
          : "The server returned an unexpected response.";
      }
      return raw;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return "Something went wrong";
  }

  const isProcessing = isLoading || isSubmitting || guestSubmitting;

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    if (guestOnly) return;
    setIsSubmitting(true);
    try {
      await onSubmitHandler(values);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      form.setError("root", {
        type: "manual",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGuestJumpIn() {
    if (!onGuestJumpIn) return;
    const raw = form.getValues("username").trim();
    const parsed = funkyGuestUsername.safeParse(raw);
    if (!parsed.success) {
      form.setError("username", {
        type: "manual",
        message: parsed.error.issues[0]?.message ?? "Invalid name",
      });
      return;
    }
    form.clearErrors("username");
    setGuestSubmitting(true);
    try {
      await onGuestJumpIn(parsed.data);
    } catch (err: unknown) {
      form.setError("root", {
        type: "manual",
        message: getErrorMessage(err),
      });
    } finally {
      setGuestSubmitting(false);
    }
  }

  const funkyMode = formType === "login" && loginLayout === "funky";

  const chipClass = cn(
    "cursor-pointer rounded-sm border-4 px-2.5 py-2 text-[6px] uppercase tracking-wider shadow-[3px_3px_0_0_rgba(0,0,0,0.85)] transition-[transform,box-shadow] sm:text-[7px]",
    "border-cyan-400/90 bg-gradient-to-br from-slate-900 to-slate-800 text-cyan-100",
    "hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_rgba(0,0,0,0.85)]",
    "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(guestOnly ? async () => {} : onSubmit)}
        className="space-y-6"
      >
        {funkyMode ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-slate-400">
              Pick a suggestion or type your own handle below.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {FUNKY_NAME_SUGGESTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={chipClass}
                  onClick={() => {
                    form.setValue("username", name, { shouldValidate: true });
                    form.clearErrors("username");
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">
                {funkyMode ? "Funky name" : "Username"}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={funkyMode ? "YOUR_HANDLE" : "Username"}
                  {...field}
                  className="font-mono text-white"
                  autoComplete="username"
                />
              </FormControl>
              {!funkyMode ? (
                <FormDescription>
                  This is your public display name.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        {!guestOnly ? (
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">
                  {funkyMode ? "Password (registered only)" : "Password"}
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    className="text-white"
                    autoComplete={
                      formType === "login" ? "current-password" : "new-password"
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {form.formState.errors.root && (
          <p className="text-sm font-medium text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        {funkyMode && onGuestJumpIn ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              disabled={isProcessing}
              className={cn(
                "font-['Press_Start_2P',monospace] h-auto min-h-11 cursor-pointer border-4 border-amber-300 py-3 text-[8px] uppercase tracking-widest text-white shadow-[4px_4px_0_0_rgba(0,0,0,0.85)] sm:text-[9px]",
                "bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-500",
                "hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_rgba(0,0,0,0.85)]",
                "active:translate-x-1 active:translate-y-1 active:shadow-none",
              )}
              onClick={() => void handleGuestJumpIn()}
            >
              {guestSubmitting ? "Jumping in…" : "Jump in!"}
            </Button>
            {!guestOnly ? (
              <Button
                type="submit"
                variant="secondary"
                disabled={isProcessing}
                className="font-mono text-sm"
              >
                {isProcessing && !guestSubmitting ? "Loading..." : buttonText}
              </Button>
            ) : null}
          </div>
        ) : (
          <Button type="submit" disabled={isProcessing}>
            {isProcessing ? "Loading..." : buttonText}
          </Button>
        )}
      </form>
    </Form>
  );
}
