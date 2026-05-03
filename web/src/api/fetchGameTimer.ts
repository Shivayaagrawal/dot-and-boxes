import axios from "axios";
import type { TimerStatePayload } from "@/types/websocket";

/** GET /api/v1/games/:id/timer — returns null when no active timer (404). */
export async function fetchGameTimer(
  gameID: string,
): Promise<TimerStatePayload | null> {
  try {
    const response = await axios.get<TimerStatePayload>(
      `/api/v1/games/${gameID}/timer`,
      { withCredentials: true },
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
