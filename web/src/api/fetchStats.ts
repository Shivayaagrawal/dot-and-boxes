import axios from "axios";

export interface UserStats {
  userID: number;
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalBoxes: number;
}

export interface LeaderboardEntry {
  rank: number;
  userID: number;
  username: string;
  value: number;
}

export interface Leaderboard {
  mostWins: LeaderboardEntry[] | null;
  mostBoxes: LeaderboardEntry[] | null;
}

/** Backend GET /stats/me is disabled; return zeros so UI still renders. */
export async function fetchMyStats(): Promise<UserStats> {
  return {
    userID: 0,
    username: "",
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalBoxes: 0,
  };
}

export async function fetchLeaderboard(): Promise<Leaderboard> {
  const response = await axios.get<Leaderboard>(`/api/v1/stats/leaderboard`, {
    withCredentials: true,
  });
  return response.data;
}
