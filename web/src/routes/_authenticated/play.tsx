import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useWebSocket } from "@/WebSocketContext";
import { LobbyList } from "@/components/Lobby";
import { BotGameModal } from "@/components/BotGameModal";
import { pixelUi } from "@/lib/pixelUi";
import { cn } from "@/lib/utils";
import Chatbox from "../../components/ChatBox";
import { GameContainer } from "@/components/GameContainer";
import { useGameWebSocketBridge } from "@/hooks/useGameWebSocketBridge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { CreateLobbyData, Lobby } from "../../types/lobby";
import type { Message } from "@/types/websocket";
import type { MainMenuDockCallbacks } from "@/pixi/mainMenu/MainMenuScene";
import { MENU_DEFAULT_BOARD_SIZE } from "@/pixi/mainMenu/MainMenuScene";
import { fetchLobbies, createLobby, toggleLobbyReady } from "@/api/lobby";
import { fetchMyStats } from "@/api/fetchStats";
import { useAuth } from "@/AuthContext";
import {
  hasCompletedLobbyNamePrompt,
  readLobbyDisplayName,
} from "@/lib/lobbyDisplay";

import { toast } from "sonner";
import axios from "axios";

export const Route = createFileRoute("/_authenticated/play")({
  validateSearch: z.object({
    /** Site header “Create lobby” — opens the Pixi create overlay after load. */
    create: z.literal("1").optional(),
  }),
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    if (!hasCompletedLobbyNamePrompt()) {
      try {
        const u = new URL(location.href, window.location.origin);
        if (u.searchParams.get("create") === "1") {
          sessionStorage.setItem("dnboxes_pending_create_lobby", "1");
        }
      } catch {
        /* ignore */
      }
      throw redirect({ to: "/choose-name", replace: true });
    }
  },
  component: Play,
  head: () => ({
    meta: [
      {
        title: "Play Now - Dots & Boxes Online",
      },
      {
        name: "description",
        content:
          "Start playing Dots & Boxes now. Join multiplayer matches or practice against AI opponents.",
      },
      {
        property: "og:title",
        content: "Play Dots & Boxes",
      },
      {
        property: "og:description",
        content: "Join a game now - multiplayer matches available!",
      },
      {
        property: "og:url",
        content: "https://dotsandboxesonline.com/play",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dotsandboxesonline.com/play",
      },
    ],
  }),
});

interface Game {
  game_id: number;
}

interface CreateBotGameData {
  board_size: number;
  num_bots: number;
}

const LS_MUTE_SFX = "dnboxes_pref_mute_sfx";
const LS_MUTE_BGM = "dnboxes_pref_mute_bgm";

const OPEN_CREATE_NONCE_KEY = "dnboxes_open_create_lobby_nonce";

function readPendingOpenCreateNonce(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(OPEN_CREATE_NONCE_KEY);
    if (!raw) return 0;
    sessionStorage.removeItem(OPEN_CREATE_NONCE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 0;
  }
}

function Play() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const auth = useAuth();
  /** Survives React Strict Mode remounts + bridges `?create=1` to `GameContainer`. */
  const [openCreateLobbyNonce, setOpenCreateLobbyNonce] = useState(
    () => readPendingOpenCreateNonce(),
  );

  useEffect(() => {
    if (search.create !== "1") return;
    const n = Date.now();
    try {
      sessionStorage.setItem(OPEN_CREATE_NONCE_KEY, String(n));
    } catch {
      /* ignore */
    }
    setOpenCreateLobbyNonce(n);
    void navigate({
      to: "/play",
      search: { create: undefined },
      replace: true,
    });
  }, [search.create, navigate]);
  const [botDialogOpen, setBotDialogOpen] = useState(false);
  const [lobbyDialogOpen, setLobbyDialogOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [muteSfx, setMuteSfx] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(LS_MUTE_SFX) === "1",
  );
  const [muteBgm, setMuteBgm] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(LS_MUTE_BGM) === "1",
  );
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  // Fetch lobbies (on failure, avoid defaulting to [] — that masks errors as “no lobbies”)
  const {
    data: lobbies,
    isLoading,
    isError: lobbiesError,
    error: lobbiesErr,
    refetch: refetchLobbies,
    isFetching: lobbiesFetching,
  } = useQuery<Lobby[]>({
    queryKey: ["lobbies"],
    queryFn: fetchLobbies,
    retry: 1,
  });

  // Fetch user stats
  const { data: stats } = useQuery({
    queryKey: ["myStats"],
    queryFn: fetchMyStats,
  });

  const myLobby = useMemo(() => {
    if (!lobbies?.length || auth.user?.userID == null) return undefined;
    const uid = auth.user.userID;
    return lobbies.find((l) => l.players?.some((p) => p.user_id === uid));
  }, [lobbies, auth.user?.userID]);

  useGameWebSocketBridge(myLobby);

  const lobbyGuestNames = useMemo(() => {
    if (!myLobby?.players || auth.user?.userID == null) return [];
    const uid = auth.user.userID;
    return myLobby.players
      .filter((p) => p.user_id !== uid)
      .map((p) => p.username)
      .slice(0, 2);
  }, [myLobby, auth.user?.userID]);

  const selfReady = useMemo(() => {
    if (!myLobby?.players || auth.user?.userID == null) return false;
    const uid = auth.user.userID;
    return myLobby.players.find((p) => p.user_id === uid)?.is_ready ?? false;
  }, [myLobby, auth.user?.userID]);

  const toggleReadyMutation = useMutation({
    mutationFn: (lobbyId: string) => toggleLobbyReady(lobbyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lobbies"] });
      toast.success("Ready status updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Create lobby mutation
  const createLobbyMutation = useMutation({
    mutationFn: createLobby,
    onSuccess: (newLobby) => {
      queryClient.setQueryData<Lobby[]>(["lobbies"], (old = []) => [
        ...old,
        newLobby,
      ]);
      void navigate({
        to: "/lobby/$lobbyID",
        params: { lobbyID: newLobby.lobby_id },
      });
    },
    onError: (error) => {
      console.error("Failed to create lobby:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create lobby",
      );
    },
  });

  // Create bot game mutation
  const createBotGameMutation = useMutation({
    mutationFn: async (data: CreateBotGameData) => {
      const response = await axios.post<Game>(
        `/api/v1/games/create-bot-game`,
        {
          human_player_id: auth.user?.userID,
          board_size: data.board_size,
          num_bots: data.num_bots,
        },
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      return response.data;
    },
    onSuccess: (game) => {
      toast.success("Bot game starting!");
      void navigate({
        to: "/game/$gameID",
        params: { gameID: String(game.game_id) },
      });
    },
    onError: (error) => {
      console.error("Failed to create bot game:", error);
      toast.error("Failed to create bot game");
    },
  });

  const handleCreateLobby = async (values: CreateLobbyData): Promise<void> => {
    await createLobbyMutation.mutateAsync(values);
  };

  const startQuickBotGame = useCallback(() => {
    setBotDialogOpen(true);
  }, []);

  const submitBotGame = useCallback(
    async (data: { board_size: number; num_bots: number }) => {
      if (!auth.user?.userID) {
        toast.error("Please login to play");
        return;
      }
      try {
        await createBotGameMutation.mutateAsync({
          board_size: data.board_size,
          num_bots: data.num_bots,
        });
        setBotDialogOpen(false);
      } catch {
        /* mutation shows toast */
      }
    },
    [auth.user?.userID, createBotGameMutation],
  );

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === "lobby_created") {
        queryClient.setQueryData<Lobby[]>(["lobbies"], (old = []) => [
          ...old,
          msg.payload,
        ]);
      } else if (msg.type === "lobby_deleted") {
        queryClient.setQueryData<Lobby[]>(["lobbies"], (old = []) =>
          old.filter((l) => l.lobby_id !== msg.payload.lobby_id),
        );
      } else if (msg.type === "lobby_updated") {
        queryClient.setQueryData<Lobby[]>(["lobbies"], (old = []) =>
          old.map((l) =>
            l.lobby_id === msg.payload.lobby_id ? { ...l, ...msg.payload } : l,
          ),
        );
      }
    });

    return unsubscribe;
  }, [subscribe, queryClient]);

  useEffect(() => {
    if (chatDialogOpen) {
      setChatUnread(0);
      return;
    }
    const unsub = subscribe((msg: Message) => {
      if (msg.type !== "chat:new") return;
      const topic = msg.topic ?? "";
      if (topic === "" || topic === "chat:global") {
        setChatUnread((n) => n + 1);
      }
    });
    return unsub;
  }, [subscribe, chatDialogOpen]);

  const lobbyDisplayName =
    readLobbyDisplayName().trim() ||
    auth.user?.username?.trim() ||
    "PLAYER";

  const dockCallbacks = useMemo((): MainMenuDockCallbacks => {
    return {
      play: () => setBotDialogOpen(true),
      home: () => void navigate({ to: "/play" }),
      list: () => {
        void refetchLobbies();
        setLobbyDialogOpen(true);
      },
      refresh: () => void refetchLobbies(),
      ready: () => {
        const uid = auth.user?.userID;
        const list = queryClient.getQueryData<Lobby[]>(["lobbies"]);
        const lobby = list?.find((l) =>
          l.players?.some((p) => p.user_id === uid),
        );
        if (!lobby) {
          toast.error("Join a lobby first (Lobbies or Online).");
          return;
        }
        toggleReadyMutation.mutate(lobby.lobby_id);
      },
      chat: () => setChatDialogOpen(true),
      trophy: () => void navigate({ to: "/leaderboard" }),
      gear: () => setSettingsDialogOpen(true),
      sound: () => {
        setMuteSfx((m) => {
          const next = !m;
          window.localStorage.setItem(LS_MUTE_SFX, next ? "1" : "0");
          return next;
        });
      },
      music: () => {
        setMuteBgm((m) => {
          const next = !m;
          window.localStorage.setItem(LS_MUTE_BGM, next ? "1" : "0");
          return next;
        });
      },
    };
  }, [
    auth.user?.userID,
    navigate,
    queryClient,
    refetchLobbies,
    toggleReadyMutation,
  ]);

  const openChooseName = useCallback(() => {
    void navigate({ to: "/choose-name" });
  }, [navigate]);

  const lobbyListSection = (
    <div
      className={cn(
        pixelUi.dialogFont,
        "max-h-[55vh] overflow-y-auto pr-1 text-[9px] leading-relaxed",
      )}
    >
      {isLoading ? (
        <p className="uppercase tracking-wide text-amber-500/90">
          Loading lobbies…
        </p>
      ) : lobbiesError ? (
        <div className="space-y-3 text-[9px] uppercase leading-snug tracking-wide">
          <p className="text-red-400 normal-case tracking-normal">
            Could not load lobbies. If you use a private window or strict privacy
            settings (for example Brave Shields), try turning shields down for this
            site or use a normal window — session cookies must be allowed for the
            API.
          </p>
          <p className="text-amber-600/90 normal-case tracking-normal">
            {lobbiesErr instanceof Error ? lobbiesErr.message : "Request failed"}
          </p>
          <Button
            type="button"
            className={pixelUi.btnSecondary}
            disabled={lobbiesFetching}
            onClick={() => void refetchLobbies()}
          >
            {lobbiesFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : (
        <LobbyList lobbies={lobbies ?? []} />
      )}
    </div>
  );

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col bg-[#06060f]">
        <GameContainer
          displayName={lobbyDisplayName}
          guestNames={lobbyGuestNames}
          dock={dockCallbacks}
          chatBadgeCount={chatUnread}
          readyHighlighted={selfReady}
          initialSoundMuted={muteSfx}
          initialMusicMuted={muteBgm}
          onYourName={openChooseName}
          onBotGame={startQuickBotGame}
          onOnlineMultiplayer={() => {
            void refetchLobbies();
            setLobbyDialogOpen(true);
          }}
          onLobbyCreateSubmit={handleCreateLobby}
          lobbyCreatePending={createLobbyMutation.isPending}
          defaultBoardSize={MENU_DEFAULT_BOARD_SIZE}
          openCreateLobbyNonce={openCreateLobbyNonce}
        />
      </div>

      <Dialog
        open={lobbyDialogOpen}
        onOpenChange={(next) => {
          if (!next) setLobbyDialogOpen(false);
        }}
      >
        <DialogContent
          overlayClassName={pixelUi.overlayHeavy}
          className={cn(
            pixelUi.dialogContent,
            pixelUi.dialogFont,
            "max-h-[90vh] gap-3 overflow-hidden sm:max-w-lg",
          )}
        >
          <DialogHeader>
            <DialogTitle className={pixelUi.title}>Online lobbies</DialogTitle>
            <DialogDescription className={pixelUi.description}>
              Join a room or create one from the main menu.
            </DialogDescription>
          </DialogHeader>
          {lobbyListSection}
        </DialogContent>
      </Dialog>

      <Dialog
        open={chatDialogOpen}
        onOpenChange={(next) => {
          if (!next) setChatDialogOpen(false);
        }}
      >
        <DialogContent
          overlayClassName={pixelUi.overlayHeavy}
          className={cn(
            pixelUi.dialogContent,
            pixelUi.dialogFont,
            "max-h-[85vh] overflow-hidden sm:max-w-md",
          )}
        >
          <DialogHeader>
            <DialogTitle className={pixelUi.title}>Global chat</DialogTitle>
            <DialogDescription className="sr-only">
              Messages on the global lobby channel
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              pixelUi.panelInset,
              "max-h-[min(70vh,28rem)] overflow-hidden p-0",
            )}
          >
            <Chatbox topic="chat:global" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={settingsDialogOpen}
        onOpenChange={(next) => {
          if (!next) setSettingsDialogOpen(false);
        }}
      >
        <DialogContent
          overlayClassName={pixelUi.overlayHeavy}
          className={cn(pixelUi.dialogContent, pixelUi.dialogFont, "sm:max-w-md")}
        >
          <DialogHeader>
            <DialogTitle className={pixelUi.title}>Quick settings</DialogTitle>
            <DialogDescription className={pixelUi.description}>
              Audio prefs stay in this browser. Lobby state comes from the server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <label
              className={cn(
                pixelUi.dialogFont,
                "flex cursor-pointer items-center justify-between gap-3 text-[9px] uppercase tracking-wide text-amber-200",
              )}
            >
              <span>Mute sfx</span>
              <input
                type="checkbox"
                className="size-4 accent-amber-600"
                checked={muteSfx}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMuteSfx(next);
                  window.localStorage.setItem(LS_MUTE_SFX, next ? "1" : "0");
                }}
              />
            </label>
            <label
              className={cn(
                pixelUi.dialogFont,
                "flex cursor-pointer items-center justify-between gap-3 text-[9px] uppercase tracking-wide text-amber-200",
              )}
            >
              <span>Mute menu music</span>
              <input
                type="checkbox"
                className="size-4 accent-amber-600"
                checked={muteBgm}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMuteBgm(next);
                  window.localStorage.setItem(LS_MUTE_BGM, next ? "1" : "0");
                }}
              />
            </label>
            <p className={cn(pixelUi.description, "!text-[7px] !normal-case")}>
              Profile & stats: dock bar or{" "}
              <button
                type="button"
                className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
                onClick={() => {
                  setSettingsDialogOpen(false);
                  setProfileDialogOpen(true);
                }}
              >
                profile
              </button>
              .
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={profileDialogOpen}
        onOpenChange={(next) => {
          if (!next) setProfileDialogOpen(false);
        }}
      >
        <DialogContent
          overlayClassName={pixelUi.overlayHeavy}
          className={cn(
            pixelUi.dialogContent,
            pixelUi.dialogFont,
            "max-h-[90vh] overflow-y-auto sm:max-w-md",
          )}
        >
          <DialogHeader>
            <DialogTitle className={pixelUi.title}>Profile</DialogTitle>
            <DialogDescription className={pixelUi.description}>
              Stats for this guest session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-[9px] uppercase tracking-wide leading-relaxed">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-amber-500/90">Signed in</span>
              <span className="normal-case tracking-normal text-amber-100">
                {auth.user?.username}
                {auth.user?.isGuest ? (
                  <span className="ml-2 border-2 border-amber-700 bg-amber-950/80 px-1 py-0.5 text-[8px] text-amber-50">
                    guest
                  </span>
                ) : null}
              </span>
            </div>

            <div className="space-y-2 border-t-4 border-[#2a2018] pt-3">
              <div className="flex justify-between gap-2">
                <span className="text-amber-500/90">Games</span>
                <span className="text-amber-50">{stats?.gamesPlayed ?? 0}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-amber-500/90">Wins</span>
                <span className="text-emerald-400">{stats?.wins ?? 0}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-amber-500/90">Losses</span>
                <span className="text-red-400">{stats?.losses ?? 0}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-amber-500/90">Win rate</span>
                <span className="text-amber-100">
                  {stats?.winRate !== undefined
                    ? `${stats.winRate.toFixed(1)}%`
                    : "0%"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-amber-500/90">Boxes</span>
                <span className="text-sky-400">{stats?.totalBoxes ?? 0}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t-4 border-[#2a2018] pt-3 normal-case">
              <Link
                to="/leaderboard"
                className="text-[9px] text-amber-400 underline underline-offset-2 hover:text-amber-300"
                onClick={() => setProfileDialogOpen(false)}
              >
                Leaderboard
              </Link>
              <Link
                to="/history"
                className="text-[9px] text-amber-400 underline underline-offset-2 hover:text-amber-300"
                onClick={() => setProfileDialogOpen(false)}
              >
                History
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BotGameModal
        open={botDialogOpen}
        onClose={() => setBotDialogOpen(false)}
        onSubmit={submitBotGame}
        defaultBoardSize={MENU_DEFAULT_BOARD_SIZE}
      />

    </>
  );
}
