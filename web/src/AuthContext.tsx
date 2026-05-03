import { createContext, useContext, ReactNode, useMemo } from "react";
import axios from "axios";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "./types/auth";
import { fetchUser, guestLogin, clearCachedMe } from "./api/fetchUser";
import { router } from "./router";
interface AuthProviderProps {
  children: ReactNode;
}

export interface AuthContextType {
  user: User | null | undefined;
  loginAsGuest: (preferredUsername?: string) => Promise<User>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isError,
    isFetched,
  } = useQuery<User | null>({
    queryKey: ["me"],
    queryFn: fetchUser,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = useMutation<undefined>({
    mutationFn: async () => {
      await axios.post(`/api/v1/logout`, null, {
        withCredentials: true,
      });
    },
    onSuccess: async () => {
      try {
        sessionStorage.removeItem("dnboxes_lobby_prompt_done");
        sessionStorage.removeItem("dnboxes_lobby_display");
        sessionStorage.removeItem("dnboxes_pending_create_lobby");
      } catch {
        /* ignore */
      }
      clearCachedMe();
      queryClient.setQueryData(["me"], null);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await router.invalidate();
      await router.navigate({ to: "/play", replace: true });
    },
  });

  const guestMutation = useMutation<User, Error, string | undefined>({
    mutationFn: guestLogin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const loginAsGuest = (preferredUsername?: string) =>
    guestMutation.mutateAsync(preferredUsername);

  const logout = () => {
    logoutMutation.mutate();
  };

  const isAuthenticated = isFetched && !isError && !!user;
  const loading =
    (!isFetched && isLoading) ||
    logoutMutation.status === "pending" ||
    guestMutation.status === "pending";

  const authContextValue = useMemo(
    () => ({
      user,
      loginAsGuest,
      logout,
      loading,
      isAuthenticated,
    }),
    [user, loginAsGuest, logout, loading, isAuthenticated],
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
