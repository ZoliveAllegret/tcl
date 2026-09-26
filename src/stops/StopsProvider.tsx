import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchAllStops } from "@/src/api/grandLyon";
import type { Stop } from "@/src/types";

const CACHE_KEY = "tcl.stops.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CachePayload = {
  savedAt: number;
  stops: Stop[];
};

type StopsContextValue = {
  stops: Stop[];
  loading: boolean;
  error: string | null;
  loadedCount: number;
  refresh: () => Promise<void>;
  getStop: (id: number) => Stop | undefined;
};

const StopsContext = createContext<StopsContextValue | null>(null);

async function readCache(): Promise<Stop[] | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) {
    return null;
  }
  const payload = JSON.parse(raw) as CachePayload;
  if (!payload.savedAt || Date.now() - payload.savedAt > MAX_AGE_MS || !Array.isArray(payload.stops)) {
    return null;
  }
  return payload.stops;
}

export function StopsProvider({ children }: { children: ReactNode }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAllStops(setLoadedCount);
      setStops(next);
      const payload: CachePayload = { savedAt: Date.now(), stops: next };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les arrêts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await readCache();
        if (cancelled) {
          return;
        }
        if (cached && cached.length > 0) {
          setStops(cached);
          setLoading(false);
          return;
        }
      } catch {
        // Le cache illisible est ignoré, on recharge le réseau.
      }
      if (!cancelled) {
        await refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const index = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops]);

  const value = useMemo<StopsContextValue>(
    () => ({
      stops,
      loading,
      error,
      loadedCount,
      refresh,
      getStop: (id: number) => index.get(id),
    }),
    [stops, loading, error, loadedCount, refresh, index],
  );

  return <StopsContext.Provider value={value}>{children}</StopsContext.Provider>;
}

export function useStops(): StopsContextValue {
  const value = useContext(StopsContext);
  if (!value) {
    throw new Error("useStops doit être utilisé dans StopsProvider.");
  }
  return value;
}
