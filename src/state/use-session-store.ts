import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppRole, SiteCode, UserProfile } from "../types/models";

interface SessionState {
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  hasRole: (roles: AppRole[]) => boolean;
  canAccessSite: (site: SiteCode) => boolean;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      hasRole: (roles) => {
        const role = get().currentUser?.role;
        return role ? roles.includes(role) : false;
      },
      canAccessSite: (site) => {
        const user = get().currentUser;
        if (!user) return false;
        if (user.role === "admin" || user.role === "operaciones") return true;
        return user.siteCode === site;
      },
    }),
    {
      name: "appweb-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ currentUser: state.currentUser }),
    },
  ),
);
