import { useEffect, useState } from "react";

import { fetchLineTrace, type LineTrace } from "@/src/api/grandLyon";

export function useLineTraces(codes: string[]): {
  traces: LineTrace[];
  loading: boolean;
  missing: string[];
} {
  const key = codes.join("|");
  const [traces, setTraces] = useState<LineTrace[]>([]);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    const requested = key ? key.split("|") : [];
    if (requested.length === 0) {
      setTraces([]);
      setMissing([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      requested.map(async (code) => {
        try {
          return await fetchLineTrace(code);
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setTraces(results.filter((trace): trace is LineTrace => trace !== null));
      setMissing(requested.filter((_, index) => results[index] === null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { traces, loading, missing };
}
