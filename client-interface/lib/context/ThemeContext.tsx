'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { themeConfig } from '../config/theme';

type Theme = 'light' | 'dark';

interface OrganizationTheme {
  colors?: {
    primary?: string;
    primaryForeground?: string;
    secondary?: string;
    secondaryForeground?: string;
  };
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  organizationTheme: OrganizationTheme | null;
  setOrganizationTheme: (theme: OrganizationTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(themeConfig.defaultTheme);
  const [organizationTheme, setOrgTheme] = useState<OrganizationTheme | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme from localStorage
    const savedTheme = localStorage.getItem(themeConfig.storageKey) as Theme;
    if (savedTheme) {
      setThemeState(savedTheme);
    }

    // Load organization theme from localStorage
    const savedOrgTheme = localStorage.getItem(themeConfig.organizationThemeKey);
    if (savedOrgTheme) {
      try {
        setOrgTheme(JSON.parse(savedOrgTheme));
      } catch (error) {
        console.error('Failed to parse organization theme:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem(themeConfig.storageKey, theme);

    // Apply organization theme if available
    if (organizationTheme?.colors) {
      root.setAttribute('data-org-theme', 'custom');
      Object.entries(organizationTheme.colors).forEach(([key, value]) => {
        if (value) {
          const cssVarName = `--org-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
          root.style.setProperty(cssVarName, value);
        }
      });
    } else {
      root.removeAttribute('data-org-theme');
    }
  }, [theme, organizationTheme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setOrganizationTheme = (orgTheme: OrganizationTheme) => {
    setOrgTheme(orgTheme);
    localStorage.setItem(themeConfig.organizationThemeKey, JSON.stringify(orgTheme));
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    organizationTheme,
    setOrganizationTheme,
  };

  // Prevent flash of unstyled content
  if (!mounted) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
