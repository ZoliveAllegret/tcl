import { collectLines, sectionLines, uniqueStops } from "@/src/lines/groupLines";

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
