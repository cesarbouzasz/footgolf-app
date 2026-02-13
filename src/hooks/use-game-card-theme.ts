import { useCallback, useEffect, useState } from 'react';

export type GameCardTheme = 'light' | 'dark';

const STORAGE_KEY = 'footgolf:gameCardTheme';

const parseTheme = (value: string | null): GameCardTheme => {
  if (value === 'dark') return 'dark';
  return 'light';
};

export function useGameCardTheme() {
  const [theme, setTheme] = useState<GameCardTheme>('light');

  useEffect(() => {
    try {
      setTheme(parseTheme(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setTheme(parseTheme(event.newValue));
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, setTheme, toggle } as const;
}
