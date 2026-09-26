import { distanceMeters, formatDistance, isInsideRegion, nearestStops, simplifyPath } from "@/src/geo";

import { stop } from "./support";

test("distanceMeters est nulle au même point et croît vers le nord", () => {
  const origin = { latitude: 45.75, longitude: 4.85 };
  expect(distanceMeters(origin, origin)).toBe(0);
  const north = distanceMeters(origin, { latitude: 45.751, longitude: 4.85 });
  expect(north).toBeGreaterThan(100);
  expect(north).toBeLessThan(120);
});

test("isInsideRegion tient compte de la marge", () => {
  const region = { latitude: 45.75, longitude: 4.85, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  expect(isInsideRegion({ latitude: 45.751, longitude: 4.851 }, region)).toBe(true);
  expect(isInsideRegion({ latitude: 46.2, longitude: 4.85 }, region)).toBe(false);
});

test("nearestStops respecte la distance et la limite", () => {
  const origin = { latitude: 45.75, longitude: 4.85 };
  const near = stop({ id: 1, name: "Proche", latitude: 45.7502, longitude: 4.85 });
  const far = stop({ id: 2, name: "Loin", latitude: 45.78, longitude: 4.85 });
  expect(nearestStops([far, near], origin, 5, 500).map((item) => item.id)).toEqual([1]);
});

test("simplifyPath garde les virages et formatDistance choisit l'unité", () => {
  const points = [
    { latitude: 45.75, longitude: 4.85 },
    { latitude: 45.75001, longitude: 4.85001 },
    { latitude: 45.76, longitude: 4.86 },
  ];
  expect(simplifyPath(points, 20).length).toBe(2);
  expect(formatDistance(180)).toBe("180 m");
  expect(formatDistance(2400)).toBe("2.4 km");
});
