import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  effective: EffectiveTheme;
  setMode: (mode: ThemeMode) => void;
  applySystem: (systemTheme: EffectiveTheme) => void;
}

function getSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function computeEffective(mode: ThemeMode): EffectiveTheme {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyToDom(theme: EffectiveTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#fafaf9');
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      effective: getSystemTheme(),
      setMode: (mode) => {
        const effective = computeEffective(mode);
        applyToDom(effective);
        set({ mode, effective });
      },
      applySystem: (systemTheme) => {
        if (get().mode === 'system') {
          applyToDom(systemTheme);
          set({ effective: systemTheme });
        }
      },
    }),
    {
      name: 'erp-admin-theme',
      partialize: (s) => ({ mode: s.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const effective = computeEffective(state.mode);
          applyToDom(effective);
          state.effective = effective;
        }
      },
    },
  ),
);

/** 在 main.tsx 启动时调一次,挂载系统主题变化的监听 */
export function setupThemeListener() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    useThemeStore.getState().applySystem(e.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
