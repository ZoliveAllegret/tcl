import { useCallback, useEffect, useState } from "react";

import { fetchVehicles } from "@/src/api/grandLyon";
import type { Vehicle } from "@/src/types";

const REFRESH_MS = 10_000;

export function useVehicles(active: boolean) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchVehicles();
      setVehicles(next);
      setUpdatedAt(new Date());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Positions indisponibles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  return { vehicles, loading, error, updatedAt, refresh };
}
