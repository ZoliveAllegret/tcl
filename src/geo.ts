import type { LatLng, MapRegion, Stop } from "@/src/types";

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(from: LatLng, to: LatLng): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function isInsideRegion(point: LatLng, region: MapRegion, padding = 0.15): boolean {
  const halfLatitude = (region.latitudeDelta * (1 + padding)) / 2;
  const halfLongitude = (region.longitudeDelta * (1 + padding)) / 2;
  return (
    Math.abs(point.latitude - region.latitude) <= halfLatitude &&
    Math.abs(point.longitude - region.longitude) <= halfLongitude
  );
}

export function nearestStops(stops: Stop[], origin: LatLng, limit: number, maxMeters: number): Stop[] {
  return stops
    .map((stop) => ({
      stop,
      meters: distanceMeters(origin, { latitude: stop.latitude, longitude: stop.longitude }),
    }))
    .filter((entry) => entry.meters <= maxMeters)
    .sort((left, right) => left.meters - right.meters)
    .slice(0, limit)
    .map((entry) => entry.stop);
}

/** Réduit un tracé en gardant les virages au-delà de la tolérance, en mètres. */
export function simplifyPath(points: LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length <= 2) {
    return points;
  }
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let cursor = start + 1; cursor < end; cursor += 1) {
      const distance = distanceToSegment(points[cursor], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = cursor;
      }
    }
    if (index !== -1 && maxDistance > toleranceMeters) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

export function boundsOf(points: LatLng[]): { north: number; south: number; east: number; west: number } | null {
  if (points.length === 0) {
    return null;
  }
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const point of points) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }
  return { north, south, east, west };
}

function distanceToSegment(point: LatLng, start: LatLng, end: LatLng): number {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos(toRadians(start.latitude));
  const endX = (end.longitude - start.longitude) * metersPerDegreeLng;
  const endY = (end.latitude - start.latitude) * metersPerDegreeLat;
  const pointX = (point.longitude - start.longitude) * metersPerDegreeLng;
  const pointY = (point.latitude - start.latitude) * metersPerDegreeLat;
  const lengthSquared = endX * endX + endY * endY;
  if (lengthSquared === 0) {
    return Math.hypot(pointX, pointY);
  }
  const projection = Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / lengthSquared));
  return Math.hypot(pointX - projection * endX, pointY - projection * endY);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
