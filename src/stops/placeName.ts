import { useEffect, useState } from "react";

import { normalizeText } from "@/src/format";
import type { Stop } from "@/src/types";

const MAX_DISTANCE_METERS = 80;
const cache = new Map<number, string>();

type ReverseFeature = {
  properties?: {
    city?: string;
    distance?: number;
  };
};

/**
 * La commune TCL suit le point GPS, parfois juste derrière la limite communale.
 * L'adresse la plus proche (BAN) donne le nom utilisé sur place.
 */
export async function resolvePlaceName(stop: Stop): Promise<string> {
  const known = cache.get(stop.id);
  if (known) {
    return known;
  }
  const fallback = stop.commune;
  try {
    const response = await fetch(
      `https://api-adresse.data.gouv.fr/reverse/?lat=${stop.latitude}&lon=${stop.longitude}&limit=1`,
    );
    if (!response.ok) {
      return fallback;
    }
    const payload = (await response.json()) as { features?: ReverseFeature[] };
    const city = payload.features?.[0]?.properties?.city;
    const distance = payload.features?.[0]?.properties?.distance;
    if (!city || distance == null || distance > MAX_DISTANCE_METERS) {
      cache.set(stop.id, fallback);
      return fallback;
    }
    const current = normalizeText(fallback);
    const next = normalizeText(city);
    const resolved = current === next || current.startsWith(`${next} `) ? fallback : city;
    cache.set(stop.id, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

export function usePlaceName(stop: Stop | undefined): string {
  const [placeName, setPlaceName] = useState(stop?.commune ?? "");

  useEffect(() => {
    if (!stop) {
      setPlaceName("");
      return;
    }
    setPlaceName(cache.get(stop.id) ?? stop.commune);
    let cancelled = false;
    void resolvePlaceName(stop).then((name) => {
      if (!cancelled) {
        setPlaceName(name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stop]);

  return placeName;
}
