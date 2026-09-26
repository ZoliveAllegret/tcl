import { normalizeText } from "@/src/format";
import { distanceMeters } from "@/src/geo";
import type { Stop } from "@/src/types";

const SAME_STOP_METERS = 400;

/** Quais du même nom, à proximité, qui desservent les mêmes lignes dans l'autre sens. */
export function oppositePlatforms(stop: Stop, stops: Stop[]): Stop[] {
  const name = normalizeText(stop.name);
  return stops.filter((candidate) => {
    if (candidate.id === stop.id) {
      return false;
    }
    if (normalizeText(candidate.name) !== name || candidate.commune !== stop.commune) {
      return false;
    }
    if (!candidate.lines.some((line) => stop.lines.includes(line))) {
      return false;
    }
    return (
      distanceMeters(
        { latitude: stop.latitude, longitude: stop.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude },
      ) <= SAME_STOP_METERS
    );
  });
}
