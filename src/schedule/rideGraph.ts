export type RideLink = {
  to: number;
  line: string;
  direction: string;
  minutes: number;
};

export type PackedRideGraph = {
  lines: string[];
  directions: string[];
  stops: number[];
  links: [number, number, number, number][][];
};

/** Même graphe que le calcul en direct : un arc par arrêt successif, durée minimale. */
export async function collectRideLinks(
  routesText: string,
  tripsText: string,
  forEachStopTimeLine: (onLine: (line: string) => void) => Promise<void>,
): Promise<Map<number, RideLink[]>> {
  const routeToCode = new Map<string, string>();
  const routeLines = routesText.split("\n");
  const routeHeader = routeLines[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const routeIndex = Object.fromEntries(routeHeader.map((name, index) => [name.trim(), index]));
  for (const rawLine of routeLines.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    const routeId = fields[routeIndex.route_id];
    const code = fields[routeIndex.route_short_name];
    if (routeId && code) {
      routeToCode.set(routeId, code);
    }
  }

  const tripInfo = new Map<string, { line: string; direction: string }>();
  const tripLines = tripsText.split("\n");
  const tripHeader = tripLines[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const tripIndex = Object.fromEntries(tripHeader.map((name, index) => [name.trim(), index]));
  for (const rawLine of tripLines.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    const code = routeToCode.get(fields[tripIndex.route_id]);
    const direction = fields[tripIndex.trip_headsign];
    const tripId = fields[tripIndex.trip_id];
    if (code && direction && tripId) {
      tripInfo.set(tripId, { line: code, direction });
    }
  }

  let tripColumn = 0;
  let timeColumn = 2;
  let stopColumn = 3;
  let sequenceColumn = 4;

  const readColumns = (line: string, header: { done: boolean }) => {
    const fields = line.replace(/^\uFEFF/, "").split(",");
    if (!header.done) {
      header.done = true;
      if (fields[0] === "trip_id") {
        tripColumn = fields.indexOf("trip_id");
        timeColumn = fields.indexOf("departure_time");
        stopColumn = fields.indexOf("stop_id");
        sequenceColumn = fields.indexOf("stop_sequence");
        return null;
      }
    }
    return fields;
  };

  const byTrip = new Map<string, number[]>();
  const header = { done: false };
  await forEachStopTimeLine((line) => {
    const fields = readColumns(line, header);
    if (!fields) {
      return;
    }
    const tripId = fields[tripColumn];
    const info = tripInfo.get(tripId);
    if (!info) {
      return;
    }
    const stopId = Number(fields[stopColumn]);
    const sequence = Number(fields[sequenceColumn]);
    const minutes = clockMinutes(fields[timeColumn]);
    if (!Number.isFinite(stopId) || minutes == null) {
      return;
    }
    const packed = byTrip.get(tripId) ?? [];
    packed.push(Number.isFinite(sequence) ? sequence : packed.length / 3, stopId, minutes);
    byTrip.set(tripId, packed);
  });

  const grouped = new Map<number, Map<string, RideLink>>();
  for (const [tripId, packed] of byTrip) {
    const info = tripInfo.get(tripId);
    if (!info || packed.length < 6) {
      continue;
    }
    const points: { sequence: number; stopId: number; minutes: number }[] = [];
    for (let index = 0; index < packed.length; index += 3) {
      points.push({ sequence: packed[index], stopId: packed[index + 1], minutes: packed[index + 2] });
    }
    points.sort((left, right) => left.sequence - right.sequence);
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from.stopId === to.stopId) {
        continue;
      }
      let minutes = to.minutes - from.minutes;
      if (minutes < 0) {
        minutes += 24 * 60;
      }
      if (minutes <= 0 || minutes > 90) {
        continue;
      }
      const bucket = grouped.get(from.stopId) ?? new Map<string, RideLink>();
      const key = `${to.stopId}\0${info.line}\0${info.direction}`;
      const current = bucket.get(key);
      if (!current || minutes < current.minutes) {
        bucket.set(key, { to: to.stopId, line: info.line, direction: info.direction, minutes });
      }
      grouped.set(from.stopId, bucket);
    }
  }

  return new Map([...grouped].map(([stopId, links]) => [stopId, [...links.values()]]));
}

export function packRideGraph(graph: Map<number, RideLink[]>): PackedRideGraph {
  const lines: string[] = [];
  const directions: string[] = [];
  const lineIndex = new Map<string, number>();
  const directionIndex = new Map<string, number>();
  const indexOf = (values: string[], lookup: Map<string, number>, value: string) => {
    const known = lookup.get(value);
    if (known != null) {
      return known;
    }
    const index = values.length;
    values.push(value);
    lookup.set(value, index);
    return index;
  };
  const stops: number[] = [];
  const links: [number, number, number, number][][] = [];
  for (const [stopId, rideLinks] of graph) {
    stops.push(stopId);
    links.push(
      rideLinks.map((link) => [
        link.to,
        indexOf(lines, lineIndex, link.line),
        indexOf(directions, directionIndex, link.direction),
        link.minutes,
      ]),
    );
  }
  return { lines, directions, stops, links };
}

export function unpackRideGraph(packed: PackedRideGraph): Map<number, RideLink[]> {
  if (!Array.isArray(packed.stops) || !Array.isArray(packed.links) || packed.stops.length !== packed.links.length) {
    throw new Error("Le réseau préparé est illisible.");
  }
  const graph = new Map<number, RideLink[]>();
  packed.stops.forEach((stopId, index) => {
    const links = packed.links[index].map(([to, line, direction, minutes]) => ({
      to,
      line: packed.lines[line],
      direction: packed.directions[direction],
      minutes,
    }));
    graph.set(stopId, links);
  });
  return graph;
}

export function sameRideGraph(left: Map<number, RideLink[]>, right: Map<number, RideLink[]>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [stopId, links] of left) {
    const other = right.get(stopId);
    if (!other || other.length !== links.length) {
      return false;
    }
    const keys = new Set(links.map(linkKey));
    if (other.some((link) => !keys.has(linkKey(link)))) {
      return false;
    }
  }
  return true;
}

function linkKey(link: RideLink): string {
  return `${link.to}\0${link.line}\0${link.direction}\0${link.minutes}`;
}

function clockMinutes(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d+):(\d{2})/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
