import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "tcl.favorites.v1";

type FavoritesContextValue = {
  ids: number[];
  ready: boolean;
  isFavorite: (id: number) => boolean;
  toggle: (id: number) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as number[]) : [];
        if (!cancelled && Array.isArray(parsed)) {
          setIds(parsed.filter((id) => Number.isFinite(id)));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (id: number) => {
    setIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ids,
      ready,
      isFavorite: (id: number) => ids.includes(id),
      toggle,
    }),
    [ids, ready, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext);
  if (!value) {
    throw new Error("useFavorites doit être utilisé dans FavoritesProvider.");
  }
  return value;
}
