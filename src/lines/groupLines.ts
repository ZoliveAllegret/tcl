import { normalizeText } from "@/src/format";
import { oppositePlatforms } from "@/src/stops/siblings";
import type { Stop } from "@/src/types";

export type LineSummary = {
  code: string;
  stopCount: number;
};

export type LineSection = {
  title: string;
  data: LineSummary[];
};

function family(code: string): number {
  if (/^[ABCD]$/.test(code)) {
    return 0;
  }
  if (/^T\d/.test(code)) {
    return 1;
  }
  if (/^JD/i.test(code) || /^PL/i.test(code)) {
    return 3;
  }
  return 2;
}

function compareCodes(left: string, right: string): number {
  const leftStrong = /^C\d/.test(left) ? 0 : /^\d/.test(left) ? 1 : 2;
  const rightStrong = /^C\d/.test(right) ? 0 : /^\d/.test(right) ? 1 : 2;
  if (leftStrong !== rightStrong) {
    return leftStrong - rightStrong;
  }
  return left.localeCompare(right, "fr", { numeric: true });
}

export function collectLines(stops: Stop[]): LineSummary[] {
  const grouped = new Map<string, Stop[]>();
  for (const stop of stops) {
    for (const code of stop.lines) {
      const lineStops = grouped.get(code) ?? [];
      lineStops.push(stop);
      grouped.set(code, lineStops);
    }
  }
  return [...grouped.entries()]
    .map(([code, lineStops]) => ({ code, stopCount: stationsOf(lineStops).length }))
    .sort((left, right) => family(left.code) - family(right.code) || compareCodes(left.code, right.code));
}

export function sectionLines(
  lines: LineSummary[],
  query: string,
  nameOf: (code: string) => string | undefined = () => undefined,
): LineSection[] {
  const normalized = normalizeText(query);
  const filtered = normalized
    ? lines.filter((line) => {
        const name = nameOf(line.code);
        return (
          normalizeText(line.code).includes(normalized) ||
          (name != null && normalizeText(name).includes(normalized))
        );
      })
    : lines;
  const groups: [string, (line: LineSummary) => boolean][] = [
    ["Métro", (line) => family(line.code) === 0],
    ["Tramway", (line) => family(line.code) === 1],
    ["Bus", (line) => family(line.code) === 2],
    ["Navettes", (line) => family(line.code) === 3],
  ];
  return groups
    .map(([title, matches]) => ({ title, data: filtered.filter(matches) }))
    .filter((section) => section.data.length > 0);
}

/** Ordre GTFS des arrêts le long de la ligne (trajet le plus long). */
export function stopsOnLine(stops: Stop[], code: string, passageOrder?: number[]): Stop[] {
  const lineStops = stops.filter((stop) => stop.lines.includes(code));
  const stations = stationsOf(lineStops);
  if (!passageOrder || passageOrder.length === 0) {
    return stations.sort((left, right) => left.name.localeCompare(right.name, "fr") || left.id - right.id);
  }
  const rank = new Map<number, number>();
  for (let index = 0; index < passageOrder.length; index += 1) {
    const stopId = passageOrder[index];
    if (stopId != null && !rank.has(stopId)) {
      rank.set(stopId, index);
    }
  }
  const stationRank = (stop: Stop): number => {
    const platformIds = [stop.id, ...oppositePlatforms(stop, lineStops).map((platform) => platform.id)];
    let best = Number.POSITIVE_INFINITY;
    for (const id of platformIds) {
      const index = rank.get(id);
      if (index != null && index < best) {
        best = index;
      }
    }
    return best;
  };
  return stations.sort(
    (left, right) =>
      stationRank(left) - stationRank(right) ||
      left.name.localeCompare(right.name, "fr") ||
      left.id - right.id,
  );
}

export function uniqueStops(stops: Stop[]): Stop[] {
  return stationsOf(stops).sort((left, right) => left.name.localeCompare(right.name, "fr") || left.id - right.id);
}

function stationsOf(stops: Stop[]): Stop[] {
  const hidden = new Set<number>();
  const stations: Stop[] = [];
  for (const stop of [...stops].sort((left, right) => left.id - right.id)) {
    if (hidden.has(stop.id)) {
      continue;
    }
    const platforms = oppositePlatforms(stop, stops);
    for (const platform of platforms) {
      hidden.add(platform.id);
    }
    stations.push(mergePlatforms(stop, platforms));
  }
  return stations;
}

function mergePlatforms(stop: Stop, platforms: Stop[]): Stop {
  if (platforms.length === 0) {
    return stop;
  }
  const lines = [...stop.lines];
  for (const platform of platforms) {
    for (const line of platform.lines) {
      if (!lines.includes(line)) {
        lines.push(line);
      }
    }
  }
  return {
    ...stop,
    lines,
    wheelchair: stop.wheelchair || platforms.some((platform) => platform.wheelchair),
  };
}
