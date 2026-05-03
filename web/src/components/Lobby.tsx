import { Lobby } from "../types/lobby";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { pixelUi } from "@/lib/pixelUi";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { joinLobby } from "@/api/lobby";

interface LobbyListProps {
  lobbies: Lobby[];
}

export const LobbyList: React.FC<LobbyListProps> = ({ lobbies }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const joinLobbyMutation = useMutation({
    mutationFn: joinLobby,
    onSuccess: (updatedLobby) => {
      // Update the lobby list with the updated lobby data
      queryClient.setQueryData<Lobby[]>(["lobbies"], (old = []) =>
        old.map((l) =>
          l.lobby_id === updatedLobby.lobby_id ? updatedLobby : l,
        ),
      );

      void navigate({
        to: "/lobby/$lobbyID",
        params: { lobbyID: updatedLobby.lobby_id },
      });
    },
    onError: (error) => {
      console.error("Failed to join lobby:", error);
    },
  });

  const handleJoinLobby = (lobbyId: string) => {
    joinLobbyMutation.mutate(lobbyId);
  };

  if (!lobbies.length) {
    return (
      <p
        className={cn(
          pixelUi.dialogFont,
          "text-[9px] uppercase tracking-wide text-amber-500/90",
        )}
      >
        No lobbies open — create one from the menu.
      </p>
    );
  }

  return (
    <ul className="space-y-2 font-['Press_Start_2P']">
      {lobbies.map((lobby) => {
        const currentPlayers = lobby.players?.length ?? 0;
        const isJoining = joinLobbyMutation.isPending;

        return (
          <li key={lobby.lobby_id} className={pixelUi.listRow}>
            <div className="min-w-0 flex-1 break-words">
              <span className="text-amber-50">{lobby.name}</span>{" "}
              <span className="text-amber-500/80">
                · host {lobby.host_id} · {currentPlayers}/{lobby.player_limit} ·{" "}
                {lobby.is_private ? "private" : "public"}
              </span>
            </div>
            <Button
              size="sm"
              className={cn(
                pixelUi.btnPrimary,
                "h-auto shrink-0 self-center py-1.5",
              )}
              onClick={() => {
                handleJoinLobby(lobby.lobby_id);
              }}
              disabled={isJoining}
            >
              {isJoining ? "…" : "Join"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
};
