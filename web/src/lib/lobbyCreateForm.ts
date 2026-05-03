import { z } from "zod";

/** Same rules as the legacy lobby modal — API payload shape. */
export const LobbyCreateSchema = z.object({
  name: z.string().trim().min(1, "Lobby name is required"),
  player_limit: z
    .number()
    .min(2, "Minimum 2 players")
    .max(10, "Maximum 10 players"),
  board_size: z
    .number()
    .min(5, "Minimum board size is 5")
    .max(10, "Maximum board size is 10"),
  is_private: z.boolean(),
});

export type LobbyCreateFormValues = z.infer<typeof LobbyCreateSchema>;

export function clampBoardApi(n: number): number {
  return Math.min(10, Math.max(5, Math.round(n)));
}
