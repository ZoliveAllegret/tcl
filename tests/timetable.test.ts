import { decodeTimetable, departuresFromTimetable, encodeTimetable, lineDayBoard, type PreparedTimetable } from "../src/schedule/timetable";

function table(partial: Partial<PreparedTimetable> = {}): PreparedTimetable {
  return {
    lines: ["69"],
    names: ["Manufacture Montluc"],
    directions: ["Montluc"],
    services: [{ days: 1 << 3, start: 20260101, end: 20261231, add: [], remove: [] }],
    byStop: new Map([[10, [{ line: 0, direction: 0, service: 0, minutes: [8 * 60, 9 * 60, 30 * 60] }]]]),
    ...partial,
  };
}

describe("horaires préparés", () => {
  const wednesday = new Date(2026, 8, 30, 7, 30, 0);

  it("conserve les passages après un aller-retour binaire", () => {
    const source = table({
      directions: ["Gare Part-Dieu"],
      byStop: new Map([[10, [{ line: 0, direction: 0, service: 0, minutes: [6 * 60, 12 * 60] }]]]),
    });
    const decoded = decodeTimetable(encodeTimetable(source));
    expect(decoded.directions).toEqual(["Gare Part-Dieu"]);
    expect(decoded.byStop.get(10)?.[0]?.minutes).toEqual([6 * 60, 12 * 60]);
  });

  it("garde un écart de plus de 255 minutes", () => {
    const decoded = decodeTimetable(encodeTimetable(table()));
    expect(decoded.byStop.get(10)?.[0]?.minutes).toEqual([8 * 60, 9 * 60, 30 * 60]);
  });

  it("ne retient que les passages du jour dans les 20 heures", () => {
    const departures = departuresFromTimetable(table(), [10], wednesday);
    expect(departures.map((item) => item.time)).toEqual([
      new Date(2026, 8, 30, 8, 0).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      new Date(2026, 8, 30, 9, 0).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    ]);
    expect(departures[0]?.line).toBe("69");
  });

  it("reprend un passage après minuit rattaché à la veille", () => {
    const overnight = table({
      services: [{ days: 1 << 2, start: 20260101, end: 20261231, add: [], remove: [] }],
      byStop: new Map([[10, [{ line: 0, direction: 0, service: 0, minutes: [25 * 60] }]]]),
    });
    const departures = departuresFromTimetable(overnight, [10], new Date(2026, 8, 30, 0, 10, 0));
    expect(departures).toHaveLength(1);
    expect(new Date(departures[0]?.at ?? 0).getHours()).toBe(1);
  });

  it("respecte une exception de calendrier", () => {
    const removed = table({
      services: [{ days: 1 << 3, start: 20260101, end: 20261231, add: [], remove: [20260930] }],
    });
    expect(departuresFromTimetable(removed, [10], wednesday)).toEqual([]);

    const added = table({
      services: [{ days: 0, start: 0, end: 0, add: [20260930], remove: [] }],
    });
    expect(departuresFromTimetable(added, [10], wednesday)).toHaveLength(2);
  });

  it("donne toutes les heures du jour d'une ligne, dans chaque sens", () => {
    const clock = (hour: number, minute: number) =>
      new Date(2026, 8, 30, hour, minute).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const source = table({
      lines: ["69", "C3"],
      names: ["Manufacture", "Campus"],
      directions: ["Montluc", "Part-Dieu"],
      byStop: new Map([
        [
          10,
          [
            { line: 0, direction: 0, service: 0, minutes: [8 * 60, 22 * 60, 30 * 60] },
            { line: 1, direction: 1, service: 0, minutes: [10 * 60] },
          ],
        ],
        [11, [{ line: 0, direction: 1, service: 0, minutes: [8 * 60 + 15] }]],
      ]),
    });

    expect(lineDayBoard(source, [10, 11], "69", wednesday)).toEqual([
      { direction: "Montluc", times: [clock(8, 0), clock(22, 0)] },
      { direction: "Part-Dieu", times: [clock(8, 15)] },
    ]);
  });

  it("limite à huit passages par ligne et par sens", () => {
    const crowded = table({
      byStop: new Map([[10, [{ line: 0, direction: 0, service: 0, minutes: Array.from({ length: 20 }, (_, index) => 8 * 60 + index * 10) }]]]),
    });
    expect(departuresFromTimetable(crowded, [10], wednesday)).toHaveLength(8);
  });
});
