import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchAllStops } from "@/src/api/grandLyon";
import { loadPreparedStops } from "@/src/schedule/prepared";
import type { Stop } from "@/src/types";

type StopsContextValue = {
  stops: Stop[];
  loading: boolean;
  error: string | null;
  loadedCount: number;
  totalCount: number | null;
  refresh: () => Promise<void>;
  getStop: (id: number) => Stop | undefined;
};

const StopsContext = createContext<StopsContextValue | null>(null);

export function StopsProvider({ children }: { children: ReactNode }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      try {
        const next = await loadPreparedStops(
          (loaded, total) => {
            setLoadedCount(loaded);
            setTotalCount(total);
          },
          (updated) => setStops(updated),
        );
        setStops(next);
      } catch {
        const next = await fetchAllStops((loaded, total) => {
          setLoadedCount(loaded);
          setTotalCount(total);
        });
        setStops(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les arrêts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
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
      totalCount,
      refresh,
      getStop: (id: number) => index.get(id),
    }),
    [stops, loading, error, loadedCount, totalCount, refresh, index],
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
