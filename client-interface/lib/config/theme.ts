export const themeConfig = {
  defaultTheme: 'light' as 'light' | 'dark',
  storageKey: 'pathment-theme',
  organizationThemeKey: 'pathment-org-theme',
  
  // Default color values (can be overridden by organization)
  colors: {
    light: {
      primary: '221.2 83.2% 53.3%',
      secondary: '210 40% 96.1%',
      accent: '210 40% 96.1%',
      background: '0 0% 100%',
      foreground: '222.2 84% 4.9%',
    },
    dark: {
      primary: '217.2 91.2% 59.8%',
      secondary: '217.2 32.6% 17.5%',
      accent: '217.2 32.6% 17.5%',
      background: '222.2 84% 4.9%',
      foreground: '210 40% 98%',
    },
  },
};
