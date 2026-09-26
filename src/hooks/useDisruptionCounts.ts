import { useEffect, useState } from "react";

import { fetchDisruptionCounts, fetchLineDisruptions, type Disruption } from "@/src/api/grandLyon";

export function useDisruptionCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchDisruptionCounts()
      .then((next) => {
        if (!cancelled) {
          setCounts(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return counts;
}

export function useLineDisruptions(code: string): { disruptions: Disruption[]; loading: boolean } {
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchLineDisruptions(code)
      .then((next) => {
        if (!cancelled) {
          setDisruptions(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisruptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return { disruptions, loading };
}
