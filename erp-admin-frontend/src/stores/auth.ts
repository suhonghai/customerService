import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserRole {
  id: number;
  code: string;
  name: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
  avatar?: string | null;
  roles: UserRole[];
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userInfo: UserInfo | null;
  setTokens: (access: string, refresh: string) => void;
  setUserInfo: (info: UserInfo) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userInfo: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUserInfo: (userInfo) => set({ userInfo }),
      logout: () => set({ accessToken: null, refreshToken: null, userInfo: null }),
    }),
    {
      name: 'erp-admin-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        userInfo: s.userInfo,
      }),
    },
  ),
);
