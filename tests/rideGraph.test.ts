import { packRideGraph, sameRideGraph, unpackRideGraph, type RideLink } from "@/src/schedule/rideGraph";

test("le réseau préparé conserve chaque liaison", () => {
  const graph = new Map<number, RideLink[]>([
    [1, [
      { to: 2, line: "B", direction: "Debourg", minutes: 2 },
      { to: 3, line: "B", direction: "Charpennes", minutes: 3 },
    ]],
    [2, [{ to: 4, line: "D", direction: "Gare de Vénissieux", minutes: 4 }]],
  ]);

  const restored = unpackRideGraph(packRideGraph(graph));

  expect(sameRideGraph(graph, restored)).toBe(true);
});
