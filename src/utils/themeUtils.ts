export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'fuhsi_theme_preference';

/**
 * Get saved theme preference from local storage
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    console.error('Error reading theme from localStorage:', e);
  }
  return 'system';
}

/**
 * Apply the selected theme to the document element and update meta theme-color
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  let isDark = false;

  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'light') {
    isDark = false;
  } else {
    // 'system'
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Update theme-color meta tag for PWA/Mobile top bar
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#0f766e');
  }
}

/**
 * Save theme preference to local storage and apply changes
 */
export function setStoredTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.error('Error saving theme to localStorage:', e);
  }
  applyTheme(theme);
  // Dispatch custom event for reactive UI updates across components
  window.dispatchEvent(new CustomEvent('fuhsi-theme-changed', { detail: theme }));
}

/**
 * Initialize theme listener and apply saved preference on app load
 */
export function initTheme(): () => void {
  const currentTheme = getStoredTheme();
  applyTheme(currentTheme);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system');
    }
  };

  try {
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  } catch (e) {
    // Fallback for older browsers
    mediaQuery.addListener(handleSystemThemeChange);
  }

  return () => {
    try {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } catch (e) {
      mediaQuery.removeListener(handleSystemThemeChange);
    }
  };
}
