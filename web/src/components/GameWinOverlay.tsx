import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { fetchLeaderboard, fetchMyStats } from "@/api/fetchStats";
import type { GamePlayer } from "@/types/websocket";
import type { LeaderboardEntry } from "@/api/fetchStats";
import { cn } from "@/lib/utils";
import { pixelUi } from "@/lib/pixelUi";

/** Fixed sparkle positions (percent of trophy wrapper) — pixel stars */
const SPARKLES = [
  { t: "8%", l: "12%", s: 10 },
  { t: "22%", l: "78%", s: 8 },
  { t: "38%", l: "6%", s: 6 },
  { t: "52%", l: "88%", s: 12 },
  { t: "68%", l: "18%", s: 7 },
  { t: "14%", l: "62%", s: 6 },
  { t: "72%", l: "72%", s: 9 },
];

function PixelSparkles() {
  return (
    <>
      {SPARKLES.map((sp, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{
            top: sp.t,
            left: sp.l,
            width: sp.s,
            height: sp.s,
            transform: "rotate(45deg)",
            imageRendering: "pixelated",
          }}
        />
      ))}
    </>
  );
}

function PixelTrophy() {
  return (
    <div
      className="mx-auto flex h-32 w-full max-w-[200px] items-center justify-center sm:h-40"
      style={{ imageRendering: "pixelated" }}
    >
      <span
        className="select-none text-[100px] leading-none drop-shadow-[4px_6px_0_rgba(0,0,0,0.85)] sm:text-[120px]"
        aria-hidden
      >
        🏆
      </span>
    </div>
  );
}

function SkyAndGround() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 flex h-[52%] flex-col">
        <div className="h-[34%] bg-[#7ecbff]" />
        <div className="h-[33%] bg-[#4eb2f7]" />
        <div className="min-h-0 flex-1 bg-[#3d9be8]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[52%] flex flex-col">
        <div className="h-3 bg-[#43a047] shadow-[inset_0_-2px_0_#2e7d32]" />
        <div
          className="flex-1 bg-[#6d4c41]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              #5d4037 0px,
              #5d4037 4px,
              #6d4c41 4px,
              #6d4c41 8px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 3px,
              rgba(0,0,0,0.12) 3px,
              rgba(0,0,0,0.12) 5px
            )`,
          }}
        />
      </div>
    </div>
  );
}

function MiniLbTable({
  title,
  entries,
  valueLabel,
  highlightUserId,
}: {
  title: string;
  entries: LeaderboardEntry[] | null | undefined;
  valueLabel: string;
  highlightUserId: number | undefined;
}) {
  const rows = entries?.slice(0, 8) ?? [];
  return (
    <div className="border-4 border-[#3f3428] bg-[#120e14] p-2">
      <p className="mb-2 border-b-2 border-[#5c4033] pb-1 text-[8px] uppercase tracking-wide text-amber-400">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="py-2 text-center text-[8px] text-amber-600">—</p>
      ) : (
        <ul className="max-h-[140px] space-y-1 overflow-y-auto pr-1">
          {rows.map((e) => {
            const hi = highlightUserId != null && e.userID === highlightUserId;
            return (
              <li
                key={`${e.userID}-${e.rank}`}
                className={cn(
                  "flex items-center justify-between gap-2 border-2 border-transparent px-1 py-0.5 text-[8px]",
                  hi && "border-amber-600/80 bg-amber-950/40 text-amber-50",
                  !hi && "text-amber-100/95",
                )}
              >
                <span className="tabular-nums text-amber-500">#{e.rank}</span>
                <span className="min-w-0 flex-1 truncate normal-case tracking-normal">
                  {e.username}
                </span>
                <span className="shrink-0 tabular-nums font-bold text-amber-200">
                  {e.value}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1 text-[7px] uppercase tracking-wide text-amber-600">
        {valueLabel}
      </p>
    </div>
  );
}

function rankForUser(
  entries: LeaderboardEntry[] | null | undefined,
  userId: number | undefined,
): number | null {
  if (userId == null || !entries?.length) return null;
  const row = entries.find((e) => e.userID === userId);
  return row?.rank ?? null;
}

export interface GameWinOverlayProps {
  winnerId: number | null;
  winnerPlayer: GamePlayer | undefined;
  players: GamePlayer[];
  currentUserId: number | undefined;
  onBackToMenu: () => void;
}

export function GameWinOverlay({
  winnerId,
  winnerPlayer,
  players,
  currentUserId,
  onBackToMenu,
}: GameWinOverlayProps) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    void queryClient.invalidateQueries({ queryKey: ["myStats"] });
  }, [queryClient]);

  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });

  const { data: myStats } = useQuery({
    queryKey: ["myStats"],
    queryFn: fetchMyStats,
    enabled: currentUserId != null,
  });

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const isTie = !winnerPlayer;
  const headline = isTie
    ? "DRAW!"
    : winnerPlayer!.user_id === currentUserId
      ? "YOU WIN!"
      : `${winnerPlayer!.username.toUpperCase()} WINS!`;

  const winsRank = rankForUser(leaderboard?.mostWins, currentUserId);
  const boxesRank = rankForUser(leaderboard?.mostBoxes, currentUserId);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <SkyAndGround />
      <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden />

      <div className="relative z-[101] mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-3 py-10 sm:px-4">
        {/* WIN banner */}
        <div
          className={cn(
            pixelUi.dialogFont,
            "relative mb-4 border-4 border-black bg-white px-6 py-3 shadow-[4px_4px_0_0_rgba(0,0,0,0.65)]",
          )}
        >
          <p className="text-center text-[14px] leading-none tracking-wide text-black sm:text-[16px]">
            {isTie ? "DRAW!" : "WIN!"}
          </p>
        </div>

        {/* Trophy + sparkles */}
        <div className="relative mb-6 w-full max-w-[280px]">
          <PixelSparkles />
          <PixelTrophy />
        </div>

        <p
          className={cn(
            pixelUi.dialogFont,
            "mb-6 max-w-md px-2 text-center text-[10px] uppercase leading-relaxed tracking-wide text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.85)]",
          )}
        >
          {headline}
        </p>

        {/* Final scores */}
        <div
          className={cn(
            pixelUi.dialogFont,
            "w-full max-w-md border-4 border-[#5c4033] bg-[#1a120e]/95 p-4 shadow-[8px_8px_0_0_rgba(0,0,0,0.55)] backdrop-blur-[2px]",
          )}
        >
          <p className="mb-3 text-[8px] uppercase tracking-widest text-amber-300">
            Final scores
          </p>
          <div className="space-y-2">
            {sortedPlayers.map((player) => (
              <div
                key={player.user_id}
                className="flex items-center justify-between border-2 border-[#5c4033]/60 bg-[#0f0b08] px-2 py-2 text-[9px] text-amber-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {player.user_id === winnerId && !isTie && (
                    <span className="text-amber-400">★</span>
                  )}
                  <span className="truncate normal-case tracking-normal">
                    {player.user_id === currentUserId ? "You" : player.username}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-bold">{player.score}</span>
              </div>
            ))}
          </div>

          {/* Your career stats (after server refresh) */}
          {myStats && currentUserId != null && (
            <div className="mt-4 border-t-4 border-[#3f3428] pt-3">
              <p className="mb-2 text-[8px] uppercase tracking-wide text-amber-500">
                Your career stats
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] normal-case tracking-normal text-amber-100/90">
                <span className="text-amber-500">Games</span>
                <span className="text-right tabular-nums">{myStats.gamesPlayed}</span>
                <span className="text-amber-500">Wins</span>
                <span className="text-right tabular-nums text-emerald-400">
                  {myStats.wins}
                </span>
                <span className="text-amber-500">Boxes</span>
                <span className="text-right tabular-nums text-sky-400">
                  {myStats.totalBoxes}
                </span>
              </div>
              {(winsRank != null || boxesRank != null) && (
                <p className="mt-2 text-[7px] uppercase leading-snug tracking-wide text-amber-600">
                  {winsRank != null && <>Wins rank #{winsRank}</>}
                  {winsRank != null && boxesRank != null && " · "}
                  {boxesRank != null && <>Boxes rank #{boxesRank}</>}
                </p>
              )}
            </div>
          )}

          {/* Leaderboard snapshot */}
          <div className="mt-4 border-t-4 border-[#3f3428] pt-3">
            <p className="mb-2 text-[8px] uppercase tracking-wide text-amber-500">
              Leaderboard snapshot
            </p>
            {lbLoading ? (
              <p className="text-[8px] uppercase text-amber-600">Loading…</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MiniLbTable
                  title="Most wins"
                  entries={leaderboard?.mostWins}
                  valueLabel="Total wins"
                  highlightUserId={currentUserId}
                />
                <MiniLbTable
                  title="Most boxes"
                  entries={leaderboard?.mostBoxes}
                  valueLabel="Boxes claimed"
                  highlightUserId={currentUserId}
                />
              </div>
            )}
            <Link
              to="/leaderboard"
              className="mt-3 inline-block text-[8px] uppercase tracking-wide text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Full leaderboard →
            </Link>
          </div>

          <Button
            type="button"
            className={cn(pixelUi.btnPrimary, "mt-6 w-full py-4 text-[9px]")}
            onClick={onBackToMenu}
          >
            Back to menu
          </Button>
        </div>
      </div>
    </div>
  );
}
