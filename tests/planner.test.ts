import type { Passage } from "@/src/types";

import { stop } from "./support";

const mockPassages = new Map<number, Passage[]>();
const mockLinks = new Map<number, { to: number; line: string; direction: string; minutes: number }[]>();

jest.mock("@/src/api/grandLyon", () => ({
  fetchPassages: (stopId: number) => Promise.resolve(mockPassages.get(stopId) ?? []),
}));

jest.mock("@/src/schedule/theoretical", () => ({
  loadRideGraph: () => Promise.resolve(mockLinks),
}));

import { planTrips } from "@/src/schedule/planner";

const at = new Date("2026-09-26T12:00:00.000Z");

function passage(stopId: number, line: string, direction: string, plusMinutes: number): Passage {
  return {
    stopId,
    line,
    direction,
    delayLabel: "",
    scheduledAt: new Date(at.getTime() + plusMinutes * 60_000).toISOString(),
    kind: "theoretical",
    destinationStopId: null,
  };
}

beforeEach(() => {
  mockPassages.clear();
  mockLinks.clear();
});

test("planTrips enchaîne deux lignes quand il n'y a pas de direct", async () => {
  const origin = stop({ id: 1, name: "Alpha", latitude: 45.76, longitude: 4.84, lines: ["A"] });
  const transfer = stop({ id: 2, name: "Beta", latitude: 45.74, longitude: 4.86, lines: ["A", "B"] });
  const destination = stop({ id: 3, name: "Gamma", latitude: 45.72, longitude: 4.83, lines: ["B"] });
  mockLinks.set(1, [{ to: 2, line: "A", direction: "Vers Beta", minutes: 6 }]);
  mockLinks.set(2, [{ to: 3, line: "B", direction: "Vers Gamma", minutes: 8 }]);
  mockPassages.set(1, [passage(1, "A", "Vers Beta", 4)]);
  mockPassages.set(2, [passage(2, "B", "Vers Gamma", 20)]);

  const trips = await planTrips(1, 3, at, [origin, transfer, destination]);

  expect(trips[0]?.provisional).toBe(false);
  expect(trips[0]?.legs.map((leg) => `${leg.line}:${leg.fromStopId}->${leg.toStopId}`)).toEqual(["A:1->2", "B:2->3"]);
});

test("planTrips place le direct avant un détour qui arrive plus tard", async () => {
  const origin = stop({ id: 1, name: "Alpha", latitude: 45.76, longitude: 4.84, lines: ["B"] });
  const via = stop({ id: 2, name: "Beta", latitude: 45.74, longitude: 4.86, lines: ["B", "C"] });
  const destination = stop({ id: 3, name: "Gamma", latitude: 45.72, longitude: 4.83, lines: ["B", "C"] });
  mockLinks.set(1, [
    { to: 3, line: "B", direction: "Sud", minutes: 11 },
    { to: 2, line: "B", direction: "Nord", minutes: 2 },
  ]);
  mockLinks.set(2, [{ to: 3, line: "C", direction: "Est", minutes: 25 }]);
  mockPassages.set(1, [passage(1, "B", "Sud", 5), passage(1, "B", "Nord", 4)]);
  mockPassages.set(2, [passage(2, "C", "Est", 15)]);

  const trips = await planTrips(1, 3, at, [origin, via, destination]);

  expect(trips[0]?.legs).toHaveLength(1);
  expect(trips[0]?.legs[0]?.line).toBe("B");
});

test("planTrips ignore un départ et une arrivée au même lieu", async () => {
  const left = stop({ id: 1, name: "Alpha", latitude: 45.75, longitude: 4.85 });
  const right = stop({ id: 2, name: "Alpha", latitude: 45.7501, longitude: 4.8501 });
  mockLinks.set(1, [{ to: 2, line: "B", direction: "Sud", minutes: 3 }]);

  await expect(planTrips(1, 2, at, [left, right])).resolves.toEqual([]);
});
