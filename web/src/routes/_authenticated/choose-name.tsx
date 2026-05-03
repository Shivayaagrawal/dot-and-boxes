import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/AuthContext";
import { pixelUi } from "@/lib/pixelUi";
import { cn } from "@/lib/utils";
import {
  markLobbyNamePromptComplete,
  readLobbyDisplayName,
  writeLobbyDisplayName,
} from "@/lib/lobbyDisplay";
import { Button } from "@/components/ui/button";

const PENDING_CREATE_LOBBY_KEY = "dnboxes_pending_create_lobby";

function consumePendingCreateLobby(): boolean {
  try {
    const v = sessionStorage.getItem(PENDING_CREATE_LOBBY_KEY);
    sessionStorage.removeItem(PENDING_CREATE_LOBBY_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/_authenticated/choose-name")({
  component: ChooseNamePage,
  head: () => ({
    meta: [
      { title: "Lobby name - Dots & Boxes" },
      {
        name: "description",
        content: "Set how your name appears on the pixel lobby menu.",
      },
    ],
  }),
});

function ChooseNamePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [value, setValue] = useState(() => {
    const stored = readLobbyDisplayName();
    if (stored) return stored;
    return auth.user?.username?.trim() ?? "";
  });

  const saveAndPlay = () => {
    writeLobbyDisplayName(value);
    markLobbyNamePromptComplete();
    const openCreate = consumePendingCreateLobby();
    void navigate({
      to: "/play",
      search: openCreate ? { create: "1" } : {},
    });
  };

  const skipToLobby = () => {
    markLobbyNamePromptComplete();
    const openCreate = consumePendingCreateLobby();
    void navigate({
      to: "/play",
      search: openCreate ? { create: "1" } : {},
    });
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center bg-[#06060f] px-4 py-8 sm:px-8 sm:py-12">
      <div
        className={cn(
          pixelUi.dialogFont,
          "w-full max-w-2xl",
          "border-4 border-[#5c4033] bg-[#0f0b14]",
          "p-6 shadow-[10px_10px_0_0_rgba(0,0,0,0.55)] sm:p-10 md:p-12",
          "relative overflow-hidden",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(251,191,36,0.15) 2px,
              rgba(251,191,36,0.15) 4px
            )`,
          }}
        />

        <div className="relative flex flex-col gap-8 sm:gap-10">
          <header className="space-y-3 text-center sm:space-y-4">
            <h1 className="text-[13px] font-normal uppercase leading-tight tracking-[0.08em] text-amber-50 sm:text-[15px] md:text-[16px] md:leading-snug">
              Your name
            </h1>
            <p className="mx-auto max-w-md text-[10px] leading-relaxed text-amber-100/85 sm:text-[11px]">
              This is what appears next to{" "}
              <span className="font-semibold text-amber-400">NAME:</span> in the
              lobby. Session only — no password here.
            </p>
          </header>

          <div className="space-y-3">
            <label className="flex flex-col gap-3 text-left">
              <span className="text-[10px] uppercase tracking-[0.12em] text-amber-400 sm:text-[11px]">
                Display name
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={24}
                placeholder={auth.user?.username ?? "PLAYER"}
                className={cn(
                  pixelUi.input,
                  "h-12 w-full text-[11px] sm:h-14 sm:px-4 sm:text-[12px]",
                )}
                autoComplete="off"
                autoFocus
              />
            </label>
            <p className="text-[8px] text-amber-500/80 sm:text-[9px]">
              Up to 24 characters
            </p>
          </div>

          <Button
            type="button"
            className={cn(
              pixelUi.btnPrimary,
              "min-h-12 w-full px-6 py-3 text-[10px] sm:min-h-14 sm:text-[11px]",
            )}
            onClick={saveAndPlay}
          >
            Continue
          </Button>

          <p className="text-center text-[8px] text-amber-200/65 sm:text-[9px]">
            <button
              type="button"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
              onClick={skipToLobby}
            >
              Skip — use suggested name
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
