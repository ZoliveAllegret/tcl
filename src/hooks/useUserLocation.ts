import { useEffect, useState } from "react";
import * as Location from "expo-location";

import type { LatLng } from "@/src/types";

export function useUserLocation(): LatLng | null {
  const [coords, setCoords] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) {
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!cancelled) {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
