import {
  collectLines,
  finalizePassageOrder,
  orientPassageOrder,
  partitionStopsOnLine,
  sectionLines,
  stopsOnLine,
  uniqueStops,
} from "@/src/lines/groupLines";

import { stop } from "./support";

test("uniqueStops fusionne les quais opposés d'une même ligne", () => {
  const south = stop({ id: 1, name: "Brotteaux", latitude: 45.766, longitude: 4.859, lines: ["B"] });
  const north = stop({ id: 2, name: "Brotteaux", latitude: 45.7661, longitude: 4.8591, lines: ["B"], wheelchair: true });
  const bus = stop({ id: 3, name: "Debourg", latitude: 45.73, longitude: 4.83, lines: ["C8"] });
  const metro = stop({ id: 4, name: "Debourg", latitude: 45.7301, longitude: 4.8301, lines: ["B"] });

  const stations = uniqueStops([south, north, bus, metro]);
  expect(stations.map((item) => item.name).sort()).toEqual(["Brotteaux", "Debourg", "Debourg"]);
  expect(stations.find((item) => item.id === 1)?.wheelchair).toBe(true);
});

test("finalizePassageOrder termine au headsign cible", () => {
  const names = new Map<number, string>([
    [1, "Gare de Vaise-G.Collomb"],
    [2, "St Germain Gare"],
    [3, "Champagne De Gaulle"],
    [4, "L'Epoux"],
  ]);
  expect(finalizePassageOrder([1, 2, 3, 4], "St Germain Gare", names)).toEqual([1, 2]);
});

test("orientPassageOrder inverse quand la destination est en tête", () => {
  const names = new Map<number, string>([
    [1, "St Germain Gare"],
    [2, "Gare de Vaise-G.Collomb"],
  ]);
  expect(orientPassageOrder([1, 2], "St Germain Gare", names)).toEqual([2, 1]);
  expect(orientPassageOrder([1, 2], "Gare de Vaise-G.Collomb", names)).toEqual([1, 2]);
});

test("partitionStopsOnLine sépare tracé principal et arrêts hors ordre", () => {
  const stops = [
    stop({ id: 10, name: "Gamma", lines: ["A"] }),
    stop({ id: 20, name: "Alpha", lines: ["A"] }),
    stop({ id: 30, name: "Beta", lines: ["A"] }),
    stop({ id: 40, name: "Delta", lines: ["A"] }),
  ];
  const { mainStops, extraStops } = partitionStopsOnLine(stops, "A", [20, 30]);
  expect(mainStops.map((item) => item.name)).toEqual(["Alpha", "Beta"]);
  expect(extraStops.map((item) => item.name)).toEqual(["Delta", "Gamma"]);
});

test("stopsOnLine suit l'ordre de passage quand il est fourni", () => {
  const stops = [
    stop({ id: 10, name: "Gamma", lines: ["A"] }),
    stop({ id: 20, name: "Alpha", lines: ["A"] }),
    stop({ id: 30, name: "Beta", lines: ["A"] }),
  ];
  expect(stopsOnLine(stops, "A", [20, 30, 10]).map((item) => item.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(stopsOnLine(stops, "A").map((item) => item.name)).toEqual(["Alpha", "Beta", "Gamma"]);
});

test("collectLines compte les stations et sectionLines filtre par nom", () => {
  const stops = [
    stop({ id: 1, name: "A", lines: ["B", "T1"] }),
    stop({ id: 2, name: "A", latitude: 45.7501, longitude: 4.8501, lines: ["B", "T1"] }),
    stop({ id: 3, name: "C", lines: ["C8"] }),
  ];
  const lines = collectLines(stops);
  expect(lines.map((line) => `${line.code}:${line.stopCount}`)).toEqual(["B:1", "T1:1", "C8:1"]);
  expect(sectionLines(lines, "tram", (code) => (code === "T1" ? "Tramway T1" : undefined)).map((section) => section.title)).toEqual([
    "Tramway",
  ]);
});
