import { createFileRoute, redirect } from "@tanstack/react-router";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lobby } from "@/types/lobby";
import { useWebSocket } from "@/WebSocketContext";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/AuthContext";
import { Message } from "@/types/websocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import {
  Users,
  Crown,
  Check,
  X,
  Wifi,
  WifiOff,
  LogOut,
  Link2,
} from "lucide-react";
import { getCsrfToken } from "@/lib/csrf";
import { hasCompletedLobbyNamePrompt } from "@/lib/lobbyDisplay";
import { LobbyPixiBackdrop } from "@/components/LobbyPixiBackdrop";
import { pixelUi } from "@/lib/pixelUi";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lobby/$lobbyID")({
  component: LobbyPage,
  /** Same session gate as `/play` — avoids landing on a Pixi shell without completing the name step. */
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!hasCompletedLobbyNamePrompt()) {
      throw redirect({ to: "/choose-name", replace: true });
    }
  },
});

function LobbyPage() {
  const { lobbyID } = useParams({ from: "/_authenticated/lobby/$lobbyID" });
  const { send, subscribe, connected } = useWebSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [isTogglingReady, setIsTogglingReady] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const { user } = useAuth();

  // Track whether the user is leaving due to game start (don't call leave API)
  const isGameStartingRef = useRef(false);
  // Track whether user already explicitly left (don't double-leave on unmount)
  const hasLeftRef = useRef(false);
  // Track whether we've already attempted an auto-rejoin this mount
  const hasAttemptedRejoin = useRef(false);

  const {
    data: lobby,
    isPending,
    isError,
    error,
  } = useQuery<Lobby, Error>({
    queryKey: ["lobby", lobbyID],
    queryFn: async () => {
      const res = await fetch(`/api/v1/lobbies/${lobbyID}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            "Lobby not found — it may have ended or the link is wrong.",
          );
        }
        throw new Error(`Could not load lobby (${res.status}).`);
      }
      return res.json() as Promise<Lobby>;
    },
    enabled: !!lobbyID,
    retry: 2,
  });

  const lobbyRedirectStarted = useRef(false);

  /** Choose-name only if the session never finished the name prompt (same gate as `/play`). */
  const lobbyFailureRoute = useCallback((): "/choose-name" | "/play" => {
    return hasCompletedLobbyNamePrompt() ? "/play" : "/choose-name";
  }, []);

  /** Never leave users on an empty shell — toast + redirect. */
  useLayoutEffect(() => {
    if (isPending) return;

    if (isError) {
      if (lobbyRedirectStarted.current) return;
      lobbyRedirectStarted.current = true;
      const msg =
        error instanceof Error ? error.message : "Could not open this lobby.";
      toast.error(msg);
      void navigate({ to: lobbyFailureRoute(), replace: true });
      return;
    }

    if (!lobby) {
      if (lobbyRedirectStarted.current) return;
      lobbyRedirectStarted.current = true;
      toast.error("Lobby unavailable.");
      void navigate({ to: lobbyFailureRoute(), replace: true });
    }
  }, [
    isPending,
    isError,
    error,
    lobby,
    navigate,
    lobbyFailureRoute,
  ]);

  // Whenever the socket is up, re-fetch lobby so the handler runs SubscribeUser (fixes:
  // WS connected after first GET, or reconnect after the server removed the client from
  // the lobby room). May cause an extra GET on first paint; that is acceptable.
  useEffect(() => {
    if (!connected || !lobbyID) return;
    void queryClient.invalidateQueries({ queryKey: ["lobby", lobbyID] });
  }, [connected, lobbyID, queryClient]);

  // Leave lobby on page close/refresh and on component unmount (navigation away)
  const leaveLobbyQuietly = useCallback(() => {
    if (isGameStartingRef.current || hasLeftRef.current) return;
    hasLeftRef.current = true;
    fetch(`/api/v1/lobbies/${lobbyID}/leave`, {
      method: "POST",
      keepalive: true,
      headers: { "X-CSRF-Token": getCsrfToken() || "" },
    });
  }, [lobbyID]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isGameStartingRef.current || hasLeftRef.current) return;
      hasLeftRef.current = true;
      const csrfData = new FormData();
      csrfData.append("_csrf", getCsrfToken() || "");
      navigator.sendBeacon(`/api/v1/lobbies/${lobbyID}/leave`, csrfData);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      /* React Strict Mode runs mount → unmount → mount while the URL is still `/lobby/:id`.
       * Calling POST /leave on that fake unmount kicks the player out and breaks the next fetch
       * (loading → blank / empty roster). Only leave when we are actually navigating away
       * (pathname has already changed — see TanStack Router commit order). Tab close / refresh
       * still uses beforeunload + sendBeacon above. */
      const raw =
        typeof window !== "undefined" ? window.location.pathname : "";
      const path = raw.replace(/\/+$/, "") || "/";
      const expected = `/lobby/${lobbyID}`;
      if (path === expected) {
        return;
      }
      leaveLobbyQuietly();
    };
  }, [lobbyID, leaveLobbyQuietly]);

  useEffect(() => {
    if (!lobbyID) return;

    const unsubscribe = subscribe((event: Message) => {
      const onLobbyTopic = event.topic === `lobby:${lobbyID}`;
      const payloadLobbyId =
        typeof event.payload === "object" &&
        event.payload !== null &&
        "lobby_id" in event.payload
          ? String((event.payload as { lobby_id?: string }).lobby_id ?? "")
          : "";
      const gameNewHere =
        event.type === "game:new" && payloadLobbyId === lobbyID;

      if (!onLobbyTopic && !gameNewHere) {
        return;
      }

      // Handle lobby_updated event
      if (event.type === "lobby_updated") {
        queryClient.setQueryData<Lobby>(["lobby", lobbyID], (old) => {
          if (!old) {
            return old;
          }

          // Merge the players update
          return {
            ...old,
            players: event.payload.players ?? old.players,
          };
        });
      }

      // Handle game_started event - navigate all players to the game
      if (event.type === "game:new") {
        isGameStartingRef.current = true;
        const id =
          typeof event.payload === "object" && event.payload !== null
            ? "gameID" in event.payload
              ? event.payload.gameID
              : "game_id" in event.payload
                ? (event.payload as { game_id: number }).game_id
                : undefined
            : undefined;
        if (id != null) {
          void navigate({
            to: "/game/$gameID",
            params: { gameID: String(id) },
          });
        }
      } else {
      }
    });

    return () => {
      unsubscribe();
    };
  }, [lobbyID, subscribe, queryClient, navigate]);

  // Auto-rejoin lobby on page load if user is not in the player list (handles browser refresh)
  useEffect(() => {
    if (!lobby || !user?.userID || hasAttemptedRejoin.current) return;

    const isInLobby = lobby.players?.some((p) => p.user_id === user.userID);
    if (isInLobby) return;

    hasAttemptedRejoin.current = true;

    fetch(`/api/v1/lobbies/${lobbyID}/join`, {
      method: "POST",
      headers: { "X-CSRF-Token": getCsrfToken() || "" },
    })
      .then((res) => {
        if (res.ok || res.status === 409) {
          // Successfully rejoined or was already in lobby, refetch to get fresh data
          queryClient.invalidateQueries({ queryKey: ["lobby", lobbyID] });
        } else if (res.status === 404) {
          // Lobby no longer exists
          void navigate({ to: "/" });
        }
      })
      .catch((err) => {
        console.error("Failed to rejoin lobby:", err);
      });
  }, [lobby, user, lobbyID, queryClient, navigate]);

  const handleStartGame = async () => {
    if (!lobby || isStarting) return;

    setIsStarting(true);

    try {
      // Extract player IDs from the lobby
      const playerIds = lobby.players?.map((p) => p.user_id) ?? [];

      // Create game (server publishes game:new to lobby:${lobbyID} for all subscribers)
      const res = await fetch(`/api/v1/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
        body: JSON.stringify({
          player_ids: playerIds,
          board_size: lobby.board_size,
          lobby_id: lobbyID,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create game");
      }

      const game = await res.json();

      // Before any slow follow-up: avoid unmount/leave racing the transition
      isGameStartingRef.current = true;

      void navigate({
        to: "/game/$gameID",
        params: { gameID: String(game.game_id) },
      });

      // Remove lobby after navigation; do not block the host on this request
      void fetch(`/api/v1/lobbies/${lobbyID}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": getCsrfToken() || "" },
      }).catch(() => {
        /* non-fatal; lobby may be cleaned up later */
      });

      // Redundant if server broadcast succeeded; keeps older backends working
      if (connected) {
        send({
          topic: `lobby:${lobbyID}`,
          type: "game:new",
          payload: { gameID: game.game_id, lobby_id: lobbyID },
        });
      }
    } catch (error) {
      alert(
        error instanceof Error
          ? "Failed to create game"
          : "Failed to create game",
      );
      setIsStarting(false);
    }
  };

  const handleToggleReady = async () => {
    if (isTogglingReady || !connected) return;

    setIsTogglingReady(true);

    try {
      const res = await fetch(`/api/v1/lobbies/${lobbyID}/ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to toggle ready status");
      }

      // The WebSocket will handle updating the UI via lobby_updated event
    } catch (error) {
      console.error("Error toggling ready status:");
    } finally {
      setIsTogglingReady(false);
    }
  };

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/join/${lobbyID}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleLeaveLobby = async () => {
    if (isLeaving) return;

    setIsLeaving(true);
    hasLeftRef.current = true;

    try {
      const res = await fetch(`/api/v1/lobbies/${lobbyID}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error("Failed to leave lobby");
      }

      // Navigate back to home/lobby list
      void navigate({ to: "/" });
    } catch (error) {
      console.error("Error leaving lobby:");
      hasLeftRef.current = false;
    } finally {
      setIsLeaving(false);
    }
  };

  if (isPending || isError || !lobby) {
    const leaving =
      isError || (!lobby && !isPending);
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[#06060f]">
        <LobbyPixiBackdrop />
        <div
          className={cn(
            pixelUi.dialogFont,
            "relative z-10 flex min-h-screen flex-col items-center justify-center gap-2 p-4",
          )}
        >
          <p className="text-[10px] text-amber-200/85 sm:text-[11px]">
            {leaving
              ? "Taking you back to Play…"
              : "Loading lobby..."}
          </p>
          {leaving ? (
            <p className="max-w-xs text-center text-[8px] leading-relaxed text-amber-500/85">
              Check the toast for details.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const currentUserID = user?.userID;

  // Check if current user is ready
  const currentPlayer = lobby?.players?.find(
    (p) => p.user_id === currentUserID,
  );
  const isCurrentUserReady = currentPlayer?.is_ready ?? false;

  // Check if all players are ready
  const allPlayersReady = lobby?.players?.every((p) => p.is_ready) ?? false;
  const hasEnoughPlayers = (lobby?.players?.length ?? 0) >= 2;

  // Check if current user is host
  const isHost = lobby?.host_id === currentUserID;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06060f]">
      <LobbyPixiBackdrop />
      <Toaster position="top-right" richColors />
      <div
        className={cn(
          pixelUi.dialogFont,
          "relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-4 sm:p-6",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(251,191,36,0.12) 2px,
              rgba(251,191,36,0.12) 4px
            )`,
          }}
          aria-hidden
        />

        <div className="relative space-y-5 sm:space-y-6">
          {/* Header */}
          <section
            className={cn(
              "border-4 border-[#5c4033] bg-[#0f0b14] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)]",
              "p-4 sm:p-5",
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-[8px] uppercase tracking-[0.18em] text-amber-500/90">
                  Lobby room
                </p>
                <h1 className="text-[11px] font-normal uppercase leading-snug tracking-[0.06em] text-amber-50 sm:text-[12px]">
                  {lobby?.name}
                </h1>
                <p className="text-[8px] leading-relaxed text-amber-200/75 sm:text-[9px]">
                  Waiting for players to ready up
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={connected ? "default" : "destructive"}
                  className={cn(
                    "rounded-none border-4 px-2 py-1 text-[7px] uppercase tracking-wide",
                    connected
                      ? "border-[#143620] bg-[#2d6a4f] text-[#e8fff2]"
                      : "border-[#5c1c1c] bg-[#7f1d1d] text-amber-50",
                  )}
                >
                  {connected ? (
                    <>
                      <Wifi className="mr-1 inline h-3 w-3" />
                      Connected
                    </>
                  ) : (
                    <>
                      <WifiOff className="mr-1 inline h-3 w-3" />
                      Disconnected
                    </>
                  )}
                </Badge>
                {lobby?.is_private ? (
                  <Button
                    onClick={copyInviteLink}
                    type="button"
                    className={cn(pixelUi.btnSecondary, "h-9 text-[7px]")}
                    size="sm"
                  >
                    <Link2 className="mr-1.5 inline h-3.5 w-3.5" />
                    Invite link
                  </Button>
                ) : null}
                <Button
                  onClick={handleLeaveLobby}
                  disabled={isLeaving}
                  type="button"
                  className={cn(pixelUi.btnDestructive, "h-9 text-[7px]")}
                  size="sm"
                >
                  <LogOut className="mr-1.5 inline h-3.5 w-3.5" />
                  {isLeaving ? "Leaving..." : "Leave"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t-4 border-[#2a2018] pt-4 text-[8px] text-amber-200/80 sm:grid-cols-2 sm:text-[9px]">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                <span>
                  Players: {lobby?.players?.length ?? 0} / {lobby?.player_limit}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span>
                  Board size: {lobby?.board_size} × {lobby?.board_size}
                </span>
              </div>
            </div>
          </section>

          {/* Players */}
          <section
            className={cn(
              "border-4 border-[#5c4033] bg-[#0f0b14] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)]",
              "p-4 sm:p-5",
            )}
          >
            <h2 className="mb-4 text-[10px] font-normal uppercase tracking-[0.08em] text-amber-50">
              Players
            </h2>
            {lobby?.players && lobby.players.length > 0 ? (
              <div className="space-y-3">
                {lobby.players.map((player) => (
                  <div
                    key={player.user_id}
                    className={cn(pixelUi.listRow, "items-center gap-3 py-3")}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center border-4 border-[#3f3428]",
                          "bg-linear-to-br from-[#4c6fa8] to-[#6b4c9a] text-[11px] font-semibold text-white",
                        )}
                      >
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[9px] text-amber-100">
                            {player.username}
                          </span>
                          {player.user_id === lobby.host_id && (
                            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                          )}
                          {player.user_id === currentUserID && (
                            <span
                              className={cn(
                                "border-4 border-stone-600 bg-stone-800 px-2 py-0.5 text-[7px] uppercase tracking-wide text-stone-200",
                                "shadow-[2px_2px_0_0_rgba(0,0,0,0.35)]",
                              )}
                            >
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-none border-4 px-2 py-1 text-[7px] uppercase tracking-wide",
                        player.is_ready
                          ? "border-[#143620] bg-[#2d6a4f] text-[#e8fff2]"
                          : "border-stone-600 bg-stone-800 text-stone-300",
                      )}
                    >
                      {player.is_ready ? (
                        <Check className="mr-1 inline h-3 w-3" />
                      ) : (
                        <X className="mr-1 inline h-3 w-3" />
                      )}
                      {player.is_ready ? "Ready" : "Not Ready"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-[8px] text-amber-200/60">
                No players in lobby
              </p>
            )}
          </section>

          {/* Actions */}
          <section
            className={cn(
              "border-4 border-[#5c4033] bg-[#0f0b14] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)]",
              "p-4 sm:p-5",
            )}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={handleToggleReady}
                  disabled={isTogglingReady || !connected}
                  type="button"
                  className={cn(
                    isCurrentUserReady ? pixelUi.btnSecondary : pixelUi.btnPrimary,
                    "min-h-12 flex-1 text-[8px] sm:min-h-11 sm:text-[9px]",
                  )}
                  size="lg"
                >
                  {isTogglingReady
                    ? "Updating..."
                    : isCurrentUserReady
                      ? "Unready"
                      : "Ready Up"}
                </Button>

                {isHost && (
                  <Button
                    onClick={handleStartGame}
                    disabled={
                      !hasEnoughPlayers || !allPlayersReady || isStarting
                    }
                    type="button"
                    className={cn(
                      pixelUi.btnPrimary,
                      "min-h-12 flex-1 text-[8px] sm:min-h-11 sm:text-[9px]",
                      (!hasEnoughPlayers || !allPlayersReady || isStarting) &&
                        "opacity-40 shadow-none",
                    )}
                    size="lg"
                  >
                    {isStarting ? "Creating Game..." : "Start Game"}
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {!allPlayersReady && hasEnoughPlayers && (
                  <div
                    className={cn(
                      "flex items-center gap-2 border-4 border-amber-900/40 bg-amber-950/35 p-3 text-[8px] text-amber-200",
                    )}
                  >
                    <span className="text-base leading-none">⚠️</span>
                    <span>All players must be ready before starting</span>
                  </div>
                )}
                {!hasEnoughPlayers && (
                  <div
                    className={cn(
                      "flex items-center gap-2 border-4 border-[#5c1c1c] bg-[#2a1010] p-3 text-[8px] text-red-300",
                    )}
                  >
                    <span className="text-base leading-none">🚫</span>
                    <span>Need at least 2 players to start</span>
                  </div>
                )}
                {!connected && (
                  <div
                    className={cn(
                      "flex items-center gap-2 border-4 border-[#5c1c1c] bg-[#2a1010] p-3 text-[8px] text-red-300",
                    )}
                  >
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    <span>WebSocket disconnected — reconnecting...</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
