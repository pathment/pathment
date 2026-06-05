'use client';

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { themeConfig } from '../config/theme';
import {
  ACCENT_STORAGE_KEY, DEFAULT_ACCENT, THEME_PRESETS, isAccentKey, type AccentKey, type ThemePreset,
} from '../config/themes';
import { appearanceApi } from '../services/appearance-api';

type Theme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  /** Resolved theme actually applied. */
  theme: Theme;
  /** User preference: light, dark, or follow the OS. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Brand accent ("vibe") preset key. */
  accent: AccentKey;
  setAccent: (accent: AccentKey) => void;
  presets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolve = (mode: ThemeMode): Theme => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode);

function applyToRoot(theme: Theme, accent: AccentKey) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [theme, setThemeStateResolved] = useState<Theme>(themeConfig.defaultTheme);
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [mounted, setMounted] = useState(false);
  const modeRef = useRef<ThemeMode>('light');
  const accentRef = useRef<AccentKey>(DEFAULT_ACCENT);

  // Mount: read cached prefs, apply synchronously (no flash — provider gates
  // children on `mounted`), wire the OS listener, then reconcile with server.
  useEffect(() => {
    // Default to light ("white") unless the user has explicitly chosen otherwise.
    let initialMode: ThemeMode = 'light';
    let initialAccent: AccentKey = DEFAULT_ACCENT;
    try {
      const saved = localStorage.getItem(themeConfig.storageKey);
      if (saved === 'light' || saved === 'dark' || saved === 'system') initialMode = saved;
      const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (isAccentKey(savedAccent)) initialAccent = savedAccent;
    } catch { /* ignore */ }

    modeRef.current = initialMode;
    accentRef.current = initialAccent;
    const resolved = resolve(initialMode);
    applyToRoot(resolved, initialAccent);
    setModeState(initialMode);
    setThemeStateResolved(resolved);
    setAccentState(initialAccent);
    setMounted(true);

    // Follow the OS when in system mode.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (modeRef.current !== 'system') return;
      const r = prefersDark() ? 'dark' : 'light';
      setThemeStateResolved(r);
      applyToRoot(r, accentRef.current);
    };
    mq.addEventListener?.('change', onChange);

    // Cross-device sync (best-effort).
    try {
      if (localStorage.getItem('token')) {
        appearanceApi.get().then((res: any) => {
          const data = res?.data ?? res ?? {};
          if (isAccentKey(data.colorTheme) && data.colorTheme !== accentRef.current) {
            accentRef.current = data.colorTheme;
            setAccentState(data.colorTheme);
            applyToRoot(resolve(modeRef.current), data.colorTheme);
            localStorage.setItem(ACCENT_STORAGE_KEY, data.colorTheme);
          }
        }).catch(() => { /* offline — cache wins */ });
      }
    } catch { /* ignore */ }

    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const persist = (next: { mode?: ThemeMode; accent?: AccentKey; resolvedTheme?: Theme }) => {
    try {
      if (next.mode) localStorage.setItem(themeConfig.storageKey, next.mode);
      if (next.accent) localStorage.setItem(ACCENT_STORAGE_KEY, next.accent);
      if (localStorage.getItem('token')) {
        appearanceApi.update({
          ...(next.accent ? { colorTheme: next.accent } : {}),
          ...(next.resolvedTheme ? { theme: next.resolvedTheme } : {}),
        }).catch(() => { /* offline */ });
      }
    } catch { /* ignore */ }
  };

  const setMode = (m: ThemeMode) => {
    modeRef.current = m;
    setModeState(m);
    const r = resolve(m);
    setThemeStateResolved(r);
    applyToRoot(r, accent);
    persist({ mode: m, resolvedTheme: r });
  };

  const setTheme = (t: Theme) => setMode(t);
  const toggleTheme = () => setMode(theme === 'light' ? 'dark' : 'light');

  const setAccent = (key: AccentKey) => {
    if (!isAccentKey(key)) return;
    accentRef.current = key;
    setAccentState(key);
    applyToRoot(theme, key);
    persist({ accent: key });
  };

  const value: ThemeContextType = { theme, mode, setMode, setTheme, toggleTheme, accent, setAccent, presets: THEME_PRESETS };

  if (!mounted) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
