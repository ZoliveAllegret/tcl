import { fetchPassages } from "@/src/api/grandLyon";
import { normalizeText } from "@/src/format";
import { distanceMeters } from "@/src/geo";
import { isRideGraphReady, loadDepartures, loadRideGraph, type RideLink } from "@/src/schedule/theoretical";
import type { Stop } from "@/src/types";

export type TripLeg = {
  line: string;
  fromStopId: number;
  toStopId: number;
  direction: string;
  departureAt: string;
  arrivalAt: string;
};

export type Trip = {
  departureAt: string;
  arrivalAt: string;
  legs: TripLeg[];
  /** Vrai quand un horaire de passage n'a pas été trouvé. */
  provisional: boolean;
};

export type TripProgress = {
  label: string;
  percent: number;
};

const TRANSFER_MINUTES = 5;
const BOARD_PENALTY_MINUTES = 4;
const SAME_PLACE_METERS = 400;
const WALK_METERS = 280;
const MAX_TRANSFERS = 3;
const MAX_WALK_HOPS = 2;
const MAX_RESULTS = 4;
const EXTRA_MINUTES = 25;
const MAX_VISITS = 250_000;

type Ride = {
  line: string;
  direction: string;
  fromStopId: number;
  toStopId: number;
  durationMinutes: number;
};

type WalkLink = {
  to: number;
  minutes: number;
};

type SearchNode = {
  stopId: number;
  lineKey: string;
  transfers: number;
  boarded: boolean;
  walkHops: number;
  time: number;
  parent: SearchNode | null;
  viaLine: string;
  viaDirection: string;
  edgeMinutes: number;
  walk: boolean;
};

export async function planTrips(
  fromStopId: number,
  toStopId: number,
  at: Date,
  stops: Stop[],
  onProgress?: (progress: TripProgress) => void,
): Promise<Trip[]> {
  const from = stops.find((stop) => stop.id === fromStopId);
  const to = stops.find((stop) => stop.id === toStopId);
  if (!from || !to || samePlace(from, to)) {
    return [];
  }

  const report = (label: string, percent: number) => {
    onProgress?.({ label, percent: Math.max(0, Math.min(99, Math.round(percent))) });
  };
  const cached = isRideGraphReady();
  if (!cached) {
    report("Téléchargement du réseau", 0);
  }
  const [rides, places] = await Promise.all([
    loadRideGraph((percent) => {
      if (!cached) {
        report("Téléchargement du réseau", percent * 0.15);
      }
    }),
    Promise.resolve(placeIndex(stops)),
  ]);
  report("Préparation des correspondances", 15);
  const walks = await walkLinks(stops, (ratio) => {
    report("Préparation des correspondances", 15 + ratio * 25);
  });
  const fromIds = new Set(places.get(fromStopId) ?? [fromStopId]);
  const toIds = new Set(places.get(toStopId) ?? [toStopId]);
  const drafts = await findPaths(rides, walks, fromIds, toIds, (ratio) => {
    report("Calcul du trajet", 40 + ratio * 30);
  });
  const passages = new Map<number, Awaited<ReturnType<typeof fetchPassages>> | null>();
  const trips: Trip[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    report("Horaires de passage", 70 + (index / Math.max(drafts.length, 1)) * 29);
    trips.push(await scheduleDraft(drafts[index], at.getTime(), places, passages, (ratio) => {
      report("Horaires de passage", 70 + ((index + ratio) / Math.max(drafts.length, 1)) * 29);
    }));
  }
  onProgress?.({ label: "Horaires de passage", percent: 100 });
  return trips.sort(
    (left, right) => left.arrivalAt.localeCompare(right.arrivalAt) || left.legs.length - right.legs.length || left.departureAt.localeCompare(right.departureAt),
  );
}

async function findPaths(
  rides: Map<number, RideLink[]>,
  walks: Map<number, WalkLink[]>,
  fromIds: Set<number>,
  toIds: Set<number>,
  onProgress?: (ratio: number) => void,
): Promise<Ride[][]> {
  const heap = new Heap<SearchNode>((left, right) => left.time < right.time || (left.time === right.time && left.transfers < right.transfers));
  const best = new Map<string, number>();
  const found: { time: number; signature: string; rides: Ride[] }[] = [];
  let visits = 0;
  let limit = Number.POSITIVE_INFINITY;

  for (const stopId of fromIds) {
    const start: SearchNode = {
      stopId,
      lineKey: "",
      transfers: 0,
      boarded: false,
      walkHops: 0,
      time: 0,
      parent: null,
      viaLine: "",
      viaDirection: "",
      edgeMinutes: 0,
      walk: false,
    };
    heap.push(start);
  }

  while (heap.size > 0 && visits < MAX_VISITS && found.length < MAX_RESULTS) {
    const node = heap.pop();
    if (!node || node.time > limit) {
      break;
    }
    visits += 1;
    if (visits % 2500 === 0) {
      onProgress?.(Math.min(0.99, visits / MAX_VISITS));
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    const key = `${node.stopId}\0${node.lineKey}\0${node.transfers}`;
    const known = best.get(key);
    if (known != null && known < node.time) {
      continue;
    }
    best.set(key, node.time);

    if (node.boarded && toIds.has(node.stopId)) {
      const path = ridesOf(node);
      const signature = path.map((ride) => `${ride.line}\0${ride.direction}`).join("|");
      if (path.length > 0 && !found.some((trip) => trip.signature === signature)) {
        found.push({ time: node.time, signature, rides: path });
        if (found.length === 1) {
          limit = node.time + EXTRA_MINUTES;
        }
      }
      continue;
    }

    if (node.walkHops < MAX_WALK_HOPS) {
      for (const walk of walks.get(node.stopId) ?? []) {
        pushNode(heap, best, {
          stopId: walk.to,
          lineKey: "",
          transfers: node.transfers,
          boarded: node.boarded,
          walkHops: node.walkHops + 1,
          time: node.time + walk.minutes,
          parent: node,
          viaLine: "",
          viaDirection: "",
          edgeMinutes: walk.minutes,
          walk: true,
        });
      }
    }

    for (const link of rides.get(node.stopId) ?? []) {
      const lineKey = `${link.line}\0${link.direction}`;
      const sameLine = node.lineKey === lineKey && lineKey !== "";
      const transfers = sameLine || !node.boarded ? node.transfers : node.transfers + 1;
      if (transfers > MAX_TRANSFERS) {
        continue;
      }
      const penalty = sameLine || !node.boarded ? 0 : BOARD_PENALTY_MINUTES;
      pushNode(heap, best, {
        stopId: link.to,
        lineKey,
        transfers,
        boarded: true,
        walkHops: 0,
        time: node.time + link.minutes + penalty,
        parent: node,
        viaLine: link.line,
        viaDirection: link.direction,
        edgeMinutes: link.minutes,
        walk: false,
      });
    }
  }

  onProgress?.(1);
  return found
    .sort((left, right) => left.time - right.time || left.rides.length - right.rides.length)
    .slice(0, MAX_RESULTS)
    .map((trip) => trip.rides);
}

function pushNode(heap: Heap<SearchNode>, best: Map<string, number>, node: SearchNode) {
  const key = `${node.stopId}\0${node.lineKey}\0${node.transfers}`;
  const known = best.get(key);
  if (known != null && known <= node.time) {
    return;
  }
  best.set(key, node.time);
  heap.push(node);
}

function ridesOf(node: SearchNode): Ride[] {
  const steps: SearchNode[] = [];
  let current: SearchNode | null = node;
  while (current?.parent) {
    steps.push(current);
    current = current.parent;
  }
  steps.reverse();
  const origin = current?.stopId ?? node.stopId;
  const rides: Ride[] = [];
  let from = origin;
  let leg: Ride | null = null;
  for (const step of steps) {
    if (step.walk) {
      if (leg) {
        rides.push(leg);
        leg = null;
      }
      from = step.stopId;
      continue;
    }
    if (leg && leg.line === step.viaLine && leg.direction === step.viaDirection) {
      leg.toStopId = step.stopId;
      leg.durationMinutes += step.edgeMinutes;
    } else {
      if (leg) {
        rides.push(leg);
      }
      leg = {
        line: step.viaLine,
        direction: step.viaDirection,
        fromStopId: from,
        toStopId: step.stopId,
        durationMinutes: Math.max(1, step.edgeMinutes),
      };
    }
    from = step.stopId;
  }
  if (leg) {
    rides.push(leg);
  }
  return rides;
}

let cachedWalks: { stops: Stop[]; links: Map<number, WalkLink[]> } | null = null;

async function walkLinks(stops: Stop[], onProgress?: (ratio: number) => void): Promise<Map<number, WalkLink[]>> {
  if (cachedWalks?.stops === stops) {
    onProgress?.(1);
    return cachedWalks.links;
  }
  const cell = 0.004;
  const grid = new Map<string, Stop[]>();
  for (const stop of stops) {
    const key = `${Math.floor(stop.latitude / cell)}\0${Math.floor(stop.longitude / cell)}`;
    const list = grid.get(key) ?? [];
    list.push(stop);
    grid.set(key, list);
  }
  const links = new Map<number, WalkLink[]>();
  const add = (from: number, to: number, minutes: number) => {
    if (from === to) {
      return;
    }
    const list = links.get(from) ?? [];
    if (!list.some((link) => link.to === to)) {
      list.push({ to, minutes });
      links.set(from, list);
    }
  };
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    const latitude = Math.floor(stop.latitude / cell);
    const longitude = Math.floor(stop.longitude / cell);
    for (let row = latitude - 1; row <= latitude + 1; row += 1) {
      for (let column = longitude - 1; column <= longitude + 1; column += 1) {
        for (const other of grid.get(`${row}\0${column}`) ?? []) {
          if (other.id === stop.id) {
            continue;
          }
          const meters = distanceMeters(stop, other);
          const sameName = normalizeText(stop.name) === normalizeText(other.name) && stop.commune === other.commune;
          if (meters <= WALK_METERS || (sameName && meters <= SAME_PLACE_METERS)) {
            add(stop.id, other.id, Math.max(2, Math.round(meters / 70)));
          }
        }
      }
    }
    if (index % 400 === 0) {
      onProgress?.(index / stops.length);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
  cachedWalks = { stops, links };
  onProgress?.(1);
  return links;
}

class Heap<T> {
  private items: T[] = [];

  constructor(private before: (left: T, right: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(this.items[index], this.items[parent])) {
        break;
      }
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let next = index;
        if (left < this.items.length && this.before(this.items[left], this.items[next])) {
          next = left;
        }
        if (right < this.items.length && this.before(this.items[right], this.items[next])) {
          next = right;
        }
        if (next === index) {
          break;
        }
        [this.items[index], this.items[next]] = [this.items[next], this.items[index]];
        index = next;
      }
    }
    return top;
  }
}

async function scheduleDraft(
  rides: Ride[],
  startAt: number,
  places: Map<number, number[]>,
  passages: Map<number, Awaited<ReturnType<typeof fetchPassages>> | null>,
  onFraction?: (ratio: number) => void,
): Promise<Trip> {
  let cursor = startAt;
  let provisional = false;
  const legs: TripLeg[] = [];
  for (let index = 0; index < rides.length; index += 1) {
    const ride = rides[index];
    const readyAt = index === 0 ? cursor : cursor + TRANSFER_MINUTES * 60_000;
    const departure = await nextDeparture(ride, readyAt, places, passages, onFraction);
    const departureAt = departure ?? readyAt;
    if (departure == null) {
      provisional = true;
    }
    const arrivalAt = departureAt + ride.durationMinutes * 60_000;
    legs.push({
      line: ride.line,
      fromStopId: ride.fromStopId,
      toStopId: ride.toStopId,
      direction: ride.direction,
      departureAt: new Date(departureAt).toISOString(),
      arrivalAt: new Date(arrivalAt).toISOString(),
    });
    cursor = arrivalAt;
  }
  return {
    departureAt: legs[0]?.departureAt ?? new Date(startAt).toISOString(),
    arrivalAt: legs[legs.length - 1]?.arrivalAt ?? new Date(startAt).toISOString(),
    legs,
    provisional,
  };
}

async function nextDeparture(
  ride: Ride,
  after: number,
  places: Map<number, number[]>,
  cache: Map<number, Awaited<ReturnType<typeof fetchPassages>> | null>,
  onFraction?: (ratio: number) => void,
): Promise<number | null> {
  const candidates = places.get(ride.fromStopId) ?? [ride.fromStopId];
  const ordered = [ride.fromStopId, ...candidates.filter((id) => id !== ride.fromStopId)];
  for (const stopId of ordered) {
    const rows = await passagesAt(stopId, cache);
    const live = pickTime(
      rows.map((passage) => ({
        line: passage.line,
        direction: passage.direction,
        at: parseWhen(passage.scheduledAt, after),
      })),
      ride,
      after,
    );
    if (live != null) {
      return live;
    }
  }
  const scheduled = await loadDepartures(ordered, undefined, onFraction);
  return pickTime(scheduled, ride, after);
}

function pickTime(
  rows: { line: string; direction: string; at: number | null }[],
  ride: Ride,
  after: number,
): number | null {
  let best: number | null = null;
  for (const row of rows) {
    if (row.at == null || row.line !== ride.line || !sameDirection(row.direction, ride.direction) || row.at < after - 60_000) {
      continue;
    }
    if (best == null || row.at < best) {
      best = row.at;
    }
  }
  return best;
}

async function passagesAt(
  stopId: number,
  cache: Map<number, Awaited<ReturnType<typeof fetchPassages>> | null>,
): Promise<Awaited<ReturnType<typeof fetchPassages>>> {
  if (cache.has(stopId)) {
    return cache.get(stopId) ?? [];
  }
  try {
    const rows = await fetchPassages(stopId);
    cache.set(stopId, rows);
    return rows;
  } catch {
    cache.set(stopId, null);
    return [];
  }
}

function parseWhen(value: string, after: number): number | null {
  if (value.includes("T") || value.includes("-")) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const date = new Date(after);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (date.getTime() < after - 60_000) {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
}

function sameDirection(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function samePlace(left: Stop, right: Stop): boolean {
  return (
    normalizeText(left.name) === normalizeText(right.name) &&
    left.commune === right.commune &&
    distanceMeters(left, right) <= SAME_PLACE_METERS
  );
}

function placeIndex(stops: Stop[]): Map<number, number[]> {
  const buckets = new Map<string, Stop[]>();
  for (const stop of stops) {
    const key = `${normalizeText(stop.name)}\0${stop.commune}`;
    const list = buckets.get(key) ?? [];
    list.push(stop);
    buckets.set(key, list);
  }
  const places = new Map<number, number[]>();
  for (const bucket of buckets.values()) {
    const pending = new Set(bucket.map((stop) => stop.id));
    for (const stop of bucket) {
      if (!pending.has(stop.id)) {
        continue;
      }
      const ids = [stop.id];
      pending.delete(stop.id);
      for (const other of bucket) {
        if (!pending.has(other.id) || distanceMeters(stop, other) > SAME_PLACE_METERS) {
          continue;
        }
        ids.push(other.id);
        pending.delete(other.id);
      }
      for (const id of ids) {
        places.set(id, ids);
      }
    }
  }
  return places;
}
