import { create } from "zustand";
import { AuthUser, Membership } from "../types";

interface AppState {
  token: string | null;
  user: AuthUser | null;
  memberships: Membership[];
  currentTeamId: string | null;
  setAuth: (token: string, user: AuthUser, memberships: Membership[]) => void;
  setMemberships: (memberships: Membership[]) => void;
  setCurrentTeamId: (teamId: string | null) => void;
  logout: () => void;
}

function loadInitial(): { token: string | null; user: AuthUser | null; memberships: Membership[]; currentTeamId: string | null } {
  try {
    const token = localStorage.getItem("auth_token");
    const userStr = localStorage.getItem("auth_user");
    const membershipsStr = localStorage.getItem("auth_memberships");
    const currentTeamId = localStorage.getItem("current_team_id");
    return {
      token,
      user: userStr ? JSON.parse(userStr) : null,
      memberships: membershipsStr ? JSON.parse(membershipsStr) : [],
      currentTeamId,
    };
  } catch {
    return { token: null, user: null, memberships: [], currentTeamId: null };
  }
}

export const useAppStore = create<AppState>((set) => ({
  ...loadInitial(),
  setAuth: (token, user, memberships) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    localStorage.setItem("auth_memberships", JSON.stringify(memberships));
    const firstTeam = memberships[0]?.teamId ?? null;
    const existing = localStorage.getItem("current_team_id");
    const currentTeamId = existing && memberships.some((m) => m.teamId === existing) ? existing : firstTeam;
    if (currentTeamId) localStorage.setItem("current_team_id", currentTeamId);
    set({ token, user, memberships, currentTeamId });
  },
  setMemberships: (memberships) => {
    localStorage.setItem("auth_memberships", JSON.stringify(memberships));
    set({ memberships });
  },
  setCurrentTeamId: (teamId) => {
    if (teamId) localStorage.setItem("current_team_id", teamId);
    else localStorage.removeItem("current_team_id");
    set({ currentTeamId: teamId });
  },
  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_memberships");
    localStorage.removeItem("current_team_id");
    set({ token: null, user: null, memberships: [], currentTeamId: null });
  },
}));
