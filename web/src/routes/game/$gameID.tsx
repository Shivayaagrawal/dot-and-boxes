import { fetchGame } from "@/api/fetchGame";
import { fetchGameTimer } from "@/api/fetchGameTimer";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toaster, toast } from "sonner";
import Grid from "../../components/Grid";
import { GameWinOverlay } from "@/components/GameWinOverlay";
import { useWebSocket } from "@/WebSocketContext";
import { useSound } from "@/hooks/useSound";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Game, Message, TimerStatePayload } from "@/types/websocket";
import Chatbox from "@/components/ChatBox";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/AuthContext";
import { getCsrfToken } from "@/lib/csrf";
import {
  applyClaimEdge,
  isEdgeFree,
} from "@/lib/optimisticGameGrid";
import {
  Trophy,
  Users,
  LogOut,
  Wifi,
  WifiOff,
  Clock,
  Timer,
  AlertTriangle,
} from "lucide-react";

export const gameDetailQuery = (id: string) => ({
  queryKey: ["game", id],
  queryFn: () => fetchGame(id),
});

/** Matches `TurnTimeLimit` in Go; used when older APIs omit `turn_limit_ms`. */
const DEFAULT_TURN_LIMIT_MS = 5000;

function normalizeTimerPayload(raw: TimerStatePayload): TimerStatePayload {
  const limit = raw.turn_limit_ms ?? DEFAULT_TURN_LIMIT_MS;
  return {
    ...raw,
    turn_limit_ms: limit,
    players: raw.players.map((p) => ({
      ...p,
      remaining_ms:
        p.turn_order === raw.active_turn
          ? Math.min(Math.max(0, p.remaining_ms), limit)
          : p.remaining_ms,
    })),
  };
}

interface LoaderData {
  gameState: Game | undefined;
}

function isGameFinished(state: Game | undefined): boolean {
  if (!state) return false;
  if (state.winner_id != null) return true;
  return state.grid.every((row) =>
    row.every((box) => box.owner_turn !== null),
  );
}

export const Route = createFileRoute("/game/$gameID")({
  component: RouteComponent,

  loader: async ({ params, context }): Promise<LoaderData> => {
    const query = gameDetailQuery(params.gameID);

    const gameState =
      context.queryClient.getQueryData<Game>(query.queryKey) ??
      (await context.queryClient.fetchQuery(query));

    return {
      gameState: gameState,
    };
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `Game ${params.gameID} - Dots & Boxes`,
      },
      {
        name: "description",
        content: "Watch or join this Dots & Boxes game in progress.",
      },
      {
        name: "robots",
        content: "noindex, follow",
      },
    ],
  }),
});

function RouteComponent() {
  const params = Route.useParams();
  const { gameState: initialGameState } = Route.useLoaderData();
  const { queryClient } = Route.useRouteContext();
  const { user } = useAuth();

  const playEdgeClick = useSound("/click.mp3");
  // const playBotMove = useSound("/click.mp3");

  const { data: gameState, refetch } = useQuery({
    ...gameDetailQuery(params.gameID),
    initialData: initialGameState,
  });

  const navigate = useNavigate();
  const { send, subscribe, connected } = useWebSocket();
  const [userColors, setUserColors] = useState<Record<number, string>>({});
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [timerState, setTimerState] = useState<TimerStatePayload | null>(null);
  const timerRef = useRef<TimerStatePayload | null>(null);

  const winnerPlayer = gameState?.players.find(
    (p) => p.user_id === gameState.winner_id,
  );

  const gameFinished = useMemo(
    () => isGameFinished(gameState),
    [gameState],
  );

  // Create mapping from turn_order to user_id
  const turnToUserIdMap = useMemo(() => {
    if (!gameState) return {};

    return gameState.players.reduce(
      (acc, player) => {
        acc[player.turn_order] = player.user_id;
        return acc;
      },
      {} as Record<number, number>,
    );
  }, [gameState]);

  useEffect(() => {
    if (!gameState) return;

    const colors: string[] = [
      "red",
      "blue",
      "green",
      "purple",
      "orange",
      "pink",
    ];
    const colorMap: Record<number, string> = {};
    gameState.players.forEach((player) => {
      colorMap[player.user_id] = colors[player.turn_order % colors.length];
    });
    setUserColors(colorMap);
  }, [gameState]);

  // Track send function in a ref so cleanup always uses the latest version
  const sendRef = useRef(send);
  sendRef.current = send;

  // Send page:join/page:leave events for game presence tracking
  useEffect(() => {
    if (!connected || !params.gameID) return;

    sendRef.current({
      type: "page:join",
      topic: `game:${params.gameID}`,
      payload: {},
    });

    return () => {
      sendRef.current({
        type: "page:leave",
        topic: `game:${params.gameID}`,
        payload: {},
      });
    };
  }, [connected, params.gameID]);

  useEffect(() => {
    if (connected && params.gameID) {
      refetch();
    }
  }, [connected, params.gameID, refetch]);

  // Timer sync is normally pushed over WebSocket. After a full page reload there are no
  // buffered messages, so hydrate from REST (same shape as game:timer payloads). Re-fetch
  // when the socket reconnects so we do not stay stale after missed WS ticks.
  useEffect(() => {
    if (!params.gameID || !gameState) return;

    let cancelled = false;
    void fetchGameTimer(params.gameID)
      .then((t) => {
        if (cancelled) return;
        if (t) {
          const n = normalizeTimerPayload(t);
          timerRef.current = n;
          setTimerState(n);
        } else {
          timerRef.current = null;
          setTimerState(null);
        }
      })
      .catch(() => {
        /* ignore — timer endpoint may fail transiently */
      });

    return () => {
      cancelled = true;
    };
  }, [params.gameID, gameState?.game_id, connected]);

  useEffect(() => {
    if (!params.gameID) {
      console.warn("No gameID available");
      return;
    }

    if (!connected) {
      console.warn("WebSocket not connected yet, waiting...");
      return;
    }

    const unsubscribe = subscribe((message: Message) => {
      if (
        message.topic === `game:${params.gameID}` &&
        message.type === "game:state"
      ) {
        // Update the game state in React Query cache
        queryClient.setQueryData(["game", params.gameID], message.payload);

        return;
      }

      // Handle timer sync events from server
      if (
        message.topic === `game:${params.gameID}` &&
        message.type === "game:timer"
      ) {
        const payload = message.payload as TimerStatePayload;
        const n = normalizeTimerPayload(payload);
        timerRef.current = n;
        setTimerState(n);
        return;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [subscribe, params.gameID, connected, queryClient]);

  /**
   * Turn clock: show `5s` style for short per-turn limits (avoids `5:00` being read as 5 minutes
   * when the server once sent a large `remaining_ms` or for sub-minute limits).
   */
  const formatTurnClock = useCallback(
    (ms: number, turnLimitMs: number): string => {
      const limit = turnLimitMs > 0 ? turnLimitMs : DEFAULT_TURN_LIMIT_MS;
      const capped = Math.min(ms, limit);
      const totalSeconds = Math.max(0, Math.ceil(capped / 1000));
      if (limit <= 90_000) {
        return `${totalSeconds}s`;
      }
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    },
    [],
  );

  // Get remaining time for a player from timer state
  const getPlayerTime = useCallback(
    (userId: number): number | null => {
      if (!timerState) return null;
      const playerTimer = timerState.players.find((p) => p.user_id === userId);
      return playerTimer?.remaining_ms ?? null;
    },
    [timerState],
  );

  // Check if a player is disconnected
  const isPlayerDisconnected = useCallback(
    (userId: number): boolean => {
      if (!timerState) return false;
      const playerTimer = timerState.players.find((p) => p.user_id === userId);
      return playerTimer?.disconnected ?? false;
    },
    [timerState],
  );

  const handleQuitGame = async () => {
    if (gameState?.game_id && user?.userID && !isGameFinished(gameState)) {
      try {
        await fetch(`/api/v1/games/${gameState.game_id}/forfeit`, {
          method: "POST",
          headers: { "X-CSRF-Token": getCsrfToken() || "" },
        });
      } catch (error) {
        console.error("Failed to forfeit game:", error);
      }
    }
    navigate({ to: "/play" });
  };

  const handleClick = useCallback(
    async (
      gameId: number,
      playerId: number,
      row: number,
      col: number,
      edge: string,
    ) => {
      if (isProcessingMove) return;

      const queryKey = ["game", params.gameID] as const;
      const before = queryClient.getQueryData<Game>(queryKey);
      if (!before || !user) return;
      if (isGameFinished(before)) return;

      const turnPlayer = before.players.find(
        (p) => p.turn_order === before.current_turn,
      );
      if (turnPlayer?.user_id !== user.userID) {
        toast.error("Not your turn");
        return;
      }
      if (playerId !== user.userID) return;

      if (
        !isEdgeFree(before.grid, before.board_size, row, col, edge)
      ) {
        return;
      }

      setIsProcessingMove(true);

      const optimistic: Game = {
        ...before,
        grid: applyClaimEdge(
          before.grid,
          before.board_size,
          row,
          col,
          edge,
        ),
      };
      queryClient.setQueryData(queryKey, optimistic);

      try {
        playEdgeClick();

        const response = await fetch(`/api/v1/games/${gameId}/move`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken() || "",
          },
          body: JSON.stringify({
            playerId: playerId,
            row: row,
            col: col,
            edge: edge,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to make move");
        }

        const updatedGame = (await response.json()) as Game;
        queryClient.setQueryData(queryKey, updatedGame);
      } catch (error) {
        queryClient.setQueryData(queryKey, before);
        console.error("Failed to make move:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to make move",
        );
      } finally {
        setIsProcessingMove(false);
      }
    },
    [
      isProcessingMove,
      params.gameID,
      playEdgeClick,
      queryClient,
      user,
    ],
  );

  if (!gameState || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#06060f] px-4">
        <p
          className="text-[10px] text-amber-100 sm:text-xs"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          LOADING TABLE…
        </p>
        {!connected ? (
          <p className="font-mono text-xs text-amber-800/90">Connecting…</p>
        ) : null}
      </div>
    );
  }

  const currentTurn = gameState.current_turn;
  const currentTurnPlayer = gameState.players.find(
    (p) => p.turn_order === currentTurn,
  );

  const isMyTurn = currentTurnPlayer?.user_id === user.userID;

  const turnDisplayText = isMyTurn
    ? "Your Turn"
    : `${currentTurnPlayer?.username || `Player ${currentTurn}`}'s Turn`;

  // Flatten the 2D grid back to 1D for the Grid component
  const flattenedBoxes = gameState.grid.flat();

  const pxPanel =
    "rounded-sm border-4 border-[#5c4033] bg-[#2a1810] shadow-[4px_4px_0_0_rgba(0,0,0,0.45)]";

  return (
    <div className="min-h-screen bg-[#06060f] p-3 sm:p-4">
      <Toaster position="top-right" richColors />

      {!connected && (
        <div className="fixed top-3 right-3 z-50">
          <span
            className={`inline-flex items-center gap-2 border-4 border-red-900 bg-red-950/95 px-3 py-2 font-['Press_Start_2P'] text-[7px] uppercase tracking-wide text-red-100 shadow-[3px_3px_0_0_rgba(0,0,0,0.5)]`}
          >
            <WifiOff className="h-3 w-3" />
            RECONNECTING
          </span>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className={pxPanel}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  {/* Turn Indicator */}
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Current Turn</p>
                      <p
                        className={`text-lg font-semibold ${
                          isMyTurn ? "text-green-400" : "text-white"
                        }`}
                      >
                        {turnDisplayText}
                      </p>
                    </div>
                    {/* Active Player Timer */}
                    {timerState &&
                      currentTurnPlayer &&
                      (() => {
                        const timeMs = getPlayerTime(currentTurnPlayer.user_id);
                        if (timeMs === null) return null;
                        const turnLimit =
                          timerState.turn_limit_ms ?? DEFAULT_TURN_LIMIT_MS;
                        const isLow =
                          timeMs <= Math.min(2000, Math.max(800, turnLimit * 0.35));
                        return (
                          <div
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-lg font-bold ${
                              isLow
                                ? "bg-red-500/20 text-red-400 animate-pulse"
                                : "bg-gray-700 text-white"
                            }`}
                          >
                            <Timer className="h-4 w-4" />
                            {formatTurnClock(timeMs, turnLimit)}
                          </div>
                        );
                      })()}
                  </div>

                  {/* Connection Status & Quit */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={connected ? "default" : "destructive"}
                      className="hidden sm:flex items-center gap-1"
                    >
                      {connected ? (
                        <>
                          <Wifi className="h-3 w-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" />
                          Disconnected
                        </>
                      )}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleQuitGame}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Quit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </div>

            <div className={pxPanel}>
              <CardContent className="flex justify-center p-4 sm:p-6">
                <div className="w-full max-w-[720px]">
                  <Grid
                    gameID={gameState.game_id}
                    boxes={flattenedBoxes}
                    userColors={userColors}
                    boardSize={gameState.board_size}
                    userID={user.userID}
                    handleClick={handleClick}
                    turnToUserIdMap={turnToUserIdMap}
                    isMyTurn={isMyTurn}
                  />
                </div>
              </CardContent>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-1">
            <div className={pxPanel}>
              <CardHeader className="border-b-4 border-[#5c4033]/60 pb-3">
                <CardTitle className="flex items-center gap-2 font-['Press_Start_2P'] text-[9px] uppercase tracking-wide text-amber-100">
                  <Users className="h-4 w-4 text-amber-200" />
                  Players
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {[...gameState.players]
                    .sort((a, b) => b.score - a.score)
                    .map((player) => {
                      const isTheirTurn =
                        player.turn_order === gameState.current_turn;
                      const isYou = player.user_id === user.userID;
                      let rowClass =
                        "flex items-center justify-between p-3 rounded-lg transition-colors ";
                      if (isTheirTurn && isYou) {
                        rowClass +=
                          "ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-900 bg-blue-500/25 border border-amber-400/70 shadow-[0_0_20px_rgba(251,191,36,0.12)]";
                      } else if (isTheirTurn) {
                        rowClass +=
                          "ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-900 bg-amber-500/15 border border-amber-500/55 shadow-[0_0_18px_rgba(251,191,36,0.14)]";
                      } else if (isYou) {
                        rowClass += "bg-blue-500/20 border border-blue-500/50";
                      } else {
                        rowClass += "bg-gray-700/50";
                      }
                      return (
                      <div key={player.user_id} className={rowClass}>
                        <div className="flex items-center gap-3">
                          {/* Winner Badge */}
                          {player.user_id === gameState.winner_id && (
                            <Trophy className="h-5 w-5 text-yellow-500" />
                          )}

                          {/* Player Avatar */}
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                            style={{
                              backgroundColor:
                                userColors[player.user_id] || "#666",
                            }}
                          >
                            {player.username.charAt(0).toUpperCase()}
                          </div>

                          {/* Player Info */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">
                                {player.user_id === user.userID
                                  ? "You"
                                  : player.username}
                              </span>
                              {isTheirTurn && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-amber-400/80 text-amber-200 bg-amber-500/20"
                                >
                                  {isYou ? "Your turn" : "Playing"}
                                </Badge>
                              )}
                              {isPlayerDisconnected(player.user_id) && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs flex items-center gap-1"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  DC
                                </Badge>
                              )}
                            </div>
                            {/* Timer display per player */}
                            {(() => {
                              const timeMs = getPlayerTime(player.user_id);
                              if (timeMs === null)
                                return (
                                  <p className="text-xs text-gray-400">
                                    Turn {player.turn_order + 1}
                                  </p>
                                );
                              const turnLimit =
                                timerState?.turn_limit_ms ??
                                DEFAULT_TURN_LIMIT_MS;
                              const isLow =
                                isTheirTurn &&
                                timeMs <=
                                  Math.min(2000, Math.max(800, turnLimit * 0.35));
                              const isActive = isTheirTurn;
                              return (
                                <p
                                  className={`text-xs font-mono ${
                                    isLow
                                      ? "text-red-400 font-semibold"
                                      : isActive
                                        ? "text-green-400"
                                        : "text-gray-400"
                                  }`}
                                >
                                  {formatTurnClock(timeMs, turnLimit)}
                                </p>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white">
                            {player.score}
                          </p>
                          <p className="text-xs text-gray-400">points</p>
                        </div>
                      </div>
                    );
                    })}
                </div>
              </CardContent>
            </div>

            <div className={`${pxPanel} overflow-hidden`}>
              <CardHeader className="flex-shrink-0 border-b-4 border-[#5c4033]/60 pb-3">
                <CardTitle className="font-['Press_Start_2P'] text-[9px] uppercase tracking-wide text-amber-100">
                  Game Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {gameState.game_id && (
                  <Chatbox
                    topic={`game:${String(gameState.game_id)}`}
                    gameID={gameState.game_id}
                  />
                )}
              </CardContent>
            </div>
          </div>
        </div>
      </div>

      {gameFinished && gameState ? (
        <GameWinOverlay
          winnerId={gameState.winner_id}
          winnerPlayer={winnerPlayer}
          players={gameState.players}
          currentUserId={user?.userID}
          onBackToMenu={() => void navigate({ to: "/play" })}
        />
      ) : null}
    </div>
  );
}
