import { Platform } from "react-native";

import { grandLyonConfig } from "@/src/config";
import { forEachDataLine, inflateText, readZipEntries } from "@/src/schedule/gtfsZip";
import { collectRideLinks, unpackRideGraph, type PackedRideGraph, type RideLink } from "@/src/schedule/rideGraph";

export type { RideLink };

export type ScheduledDeparture = {
  line: string;
  direction: string;
  time: string;
  at: number;
};

const HORIZON_MS = 20 * 60 * 60 * 1000;
const MAX_PER_DIRECTION = 8;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type ActiveTrip = {
  line: string;
  direction: string;
  days: string[];
};

type DirectionGroup = {
  line: string;
  direction: string;
  times: number[];
};

let cachedDay = "";
let cachedNext = new Map<number, ScheduledDeparture[]>();
let nextScan: Promise<void> | null = null;
let gtfsEntries: Promise<Map<string, Uint8Array>> | null = null;
let lineNames = new Map<string, string>();

export function getLineName(code: string): string | undefined {
  return lineNames.get(code);
}

function authorizationHeader(): string {
  return `Basic ${globalThis.btoa(`${grandLyonConfig.username}:${grandLyonConfig.password}`)}`;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}${month}${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function departureInstant(serviceDay: string, gtfsTime: string): number {
  const year = Number(serviceDay.slice(0, 4));
  const month = Number(serviceDay.slice(4, 6)) - 1;
  const day = Number(serviceDay.slice(6, 8));
  const [hours, minutes] = gtfsTime.split(":");
  const instant = new Date(year, month, day);
  instant.setMinutes(Number(hours) * 60 + Number(minutes));
  return instant.getTime();
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function rememberTime(group: DirectionGroup, at: number, maxPerDirection: number) {
  if (group.times.includes(at)) {
    return;
  }
  if (group.times.length < maxPerDirection) {
    group.times.push(at);
    return;
  }
  let latestIndex = 0;
  for (let index = 1; index < group.times.length; index += 1) {
    if (group.times[index] > group.times[latestIndex]) {
      latestIndex = index;
    }
  }
  if (at < group.times[latestIndex]) {
    group.times[latestIndex] = at;
  }
}

function parseLineNames(routesText: string): Map<string, string> {
  const names = new Map<string, string>();
  const routes = routesText.split("\n");
  const routeHeader = routes[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const routeIndex = Object.fromEntries(routeHeader.map((name, index) => [name.trim(), index]));
  for (const rawLine of routes.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    const code = fields[routeIndex.route_short_name];
    const label = fields[routeIndex.route_long_name];
    if (code && label) {
      names.set(code, label.replaceAll(" - ", " – "));
    }
  }
  return names;
}

const GTFS_CACHE = "tcl-gtfs-v1";
const GTFS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function readCachedGtfs(): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") {
    return null;
  }
  const cache = await caches.open(GTFS_CACHE);
  const hit = await cache.match(grandLyonConfig.gtfsUrl);
  if (!hit) {
    return null;
  }
  const savedAt = Number(hit.headers.get("x-tcl-saved-at") || 0);
  if (!savedAt || Date.now() - savedAt > GTFS_MAX_AGE_MS) {
    await cache.delete(grandLyonConfig.gtfsUrl);
    return null;
  }
  return hit.arrayBuffer();
}

async function rememberGtfs(buffer: ArrayBuffer): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const cache = await caches.open(GTFS_CACHE);
    await cache.put(
      grandLyonConfig.gtfsUrl,
      new Response(buffer.slice(0), {
        headers: { "x-tcl-saved-at": String(Date.now()) },
      }),
    );
  } catch {
    // Le téléphone peut refuser un fichier de cette taille. Le trajet continue sans cache.
  }
}

async function loadGtfsEntries(): Promise<Map<string, Uint8Array>> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Cet appareil ne peut pas ouvrir le fichier d'horaires TCL.");
  }
  if (!gtfsEntries) {
    gtfsEntries = (async () => {
      const cached = await readCachedGtfs();
      if (cached) {
        return readZipEntries(cached);
      }
      const response = await fetch(grandLyonConfig.gtfsUrl, {
        headers: { Authorization: authorizationHeader() },
      });
      if (!response.ok) {
        throw new Error(`Les horaires théoriques ont répondu ${response.status}.`);
      }
      const buffer = await response.arrayBuffer();
      await rememberGtfs(buffer);
      return readZipEntries(buffer);
    })().catch((error: unknown) => {
      gtfsEntries = null;
      throw error;
    });
  }
  return gtfsEntries;
}

/** Lance le téléchargement des horaires dès l'ouverture, sans bloquer l'écran. */
export function warmTheoreticalSchedule(): void {
  if (typeof window === "undefined") {
    return;
  }
  const start = () => {
    void loadGtfsEntries().catch(() => undefined);
    void loadRideGraph().catch(() => undefined);
  };
  const idle = window as Window & { requestIdleCallback?: (callback: () => void) => void };
  if (idle.requestIdleCallback) {
    idle.requestIdleCallback(start);
  } else {
    setTimeout(start, 1200);
  }
}

export async function loadLineNames(): Promise<void> {
  if (lineNames.size > 0) {
    return;
  }
  const entries = await loadGtfsEntries();
  const routes = entries.get("routes.txt");
  if (!routes) {
    throw new Error("La liste des lignes est absente du fichier d'horaires.");
  }
  const names = parseLineNames(await inflateText(routes));
  if (lineNames.size === 0) {
    lineNames = names;
  }
}

const STOP_TIME_LINES = 3_200_000;

async function buildIndex(
  wanted: Set<number> | null,
  maxPerDirection: number,
  onProgress?: (message: string) => void,
  onFraction?: (ratio: number) => void,
): Promise<Map<number, ScheduledDeparture[]>> {
  onProgress?.("Téléchargement des horaires…");
  const entries = await loadGtfsEntries();
  const required = ["calendar.txt", "calendar_dates.txt", "routes.txt", "trips.txt", "stop_times.txt"];
  for (const name of required) {
    if (!entries.has(name)) {
      throw new Error("Le fichier d'horaires TCL est incomplet.");
    }
  }

  const now = new Date();
  const from = now.getTime();
  const until = from + HORIZON_MS;
  const days = [startOfLocalDay(new Date(now.getTime() - 24 * 60 * 60 * 1000)), startOfLocalDay(now)];
  const dayKeys = new Set(days.map(dayKey));

  onProgress?.("Préparation des lignes…");
  const services = new Map<string, Set<string>>();
  const calendar = (await inflateText(entries.get("calendar.txt")!)).split("\n");
  const calendarHeader = calendar[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const calendarIndex = Object.fromEntries(calendarHeader.map((name, index) => [name.trim(), index]));
  for (const rawLine of calendar.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    const serviceId = fields[calendarIndex.service_id];
    const start = fields[calendarIndex.start_date];
    const end = fields[calendarIndex.end_date];
    for (const day of days) {
      const key = dayKey(day);
      if (key < start || key > end || fields[calendarIndex[WEEKDAYS[day.getDay()]]] !== "1") {
        continue;
      }
      const active = services.get(serviceId) ?? new Set<string>();
      active.add(key);
      services.set(serviceId, active);
    }
  }

  const exceptions = (await inflateText(entries.get("calendar_dates.txt")!)).split("\n");
  for (const rawLine of exceptions.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const [serviceId, date, exceptionType] = line.split(",");
    if (!dayKeys.has(date)) {
      continue;
    }
    const active = services.get(serviceId) ?? new Set<string>();
    if (exceptionType === "1") {
      active.add(date);
    } else if (exceptionType === "2") {
      active.delete(date);
    }
    services.set(serviceId, active);
  }

  const routeNames = new Map<string, string>();
  const routes = (await inflateText(entries.get("routes.txt")!)).split("\n");
  const routeHeader = routes[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const routeIndex = Object.fromEntries(routeHeader.map((name, index) => [name.trim(), index]));
  const nextLineNames = parseLineNames(routes.join("\n"));
  for (const rawLine of routes.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    routeNames.set(fields[routeIndex.route_id], fields[routeIndex.route_short_name]);
  }
  lineNames = nextLineNames;

  const trips = new Map<string, ActiveTrip>();
  let tripHeader = true;
  let tripIndex: Record<string, number> = {};
  await forEachDataLine(entries.get("trips.txt")!, (rawLine) => {
    const line = rawLine.replace(/^\uFEFF/, "");
    if (tripHeader) {
      tripHeader = false;
      tripIndex = Object.fromEntries(line.split(",").map((name, index) => [name.trim(), index]));
      return;
    }
    const fields = line.split(",");
    const activeDays = services.get(fields[tripIndex.service_id]);
    if (!activeDays || activeDays.size === 0) {
      return;
    }
    trips.set(fields[tripIndex.trip_id], {
      line: routeNames.get(fields[tripIndex.route_id]) ?? "?",
      direction: fields[tripIndex.trip_headsign] || "Direction inconnue",
      days: [...activeDays],
    });
  });

  onProgress?.("Lecture des heures de passage…");
  const groups = new Map<number, Map<string, DirectionGroup>>();
  let seen = 0;
  await forEachDataLine(entries.get("stop_times.txt")!, (line) => {
    seen += 1;
    if (seen % 80_000 === 0) {
      onFraction?.(Math.min(0.99, seen / STOP_TIME_LINES));
    }
    const clean = line.replace(/^\uFEFF/, "");
    if (seen === 1 && clean.startsWith("trip_id")) {
      return;
    }
    const fields = clean.split(",");
    const trip = trips.get(fields[0]);
    if (!trip || fields[6] === "1") {
      return;
    }
    const stopId = Number(fields[3]);
    if (!Number.isFinite(stopId) || (wanted && !wanted.has(stopId))) {
      return;
    }
    for (const serviceDay of trip.days) {
      const at = departureInstant(serviceDay, fields[2]);
      if (at < from || at > until) {
        continue;
      }
      const stopGroups = groups.get(stopId) ?? new Map<string, DirectionGroup>();
      const key = `${trip.line}\0${trip.direction}`;
      const group = stopGroups.get(key) ?? { line: trip.line, direction: trip.direction, times: [] };
      rememberTime(group, at, maxPerDirection);
      stopGroups.set(key, group);
      groups.set(stopId, stopGroups);
    }
  });

  const index = new Map<number, ScheduledDeparture[]>();
  for (const [stopId, stopGroups] of groups) {
    const departures: ScheduledDeparture[] = [];
    for (const group of stopGroups.values()) {
      for (const at of group.times) {
        departures.push({
          line: group.line,
          direction: group.direction,
          at,
          time: formatTime(at),
        });
      }
    }
    departures.sort((left, right) => left.at - right.at);
    index.set(stopId, departures);
  }
  return index;
}

let rideGraph: Promise<Map<number, RideLink[]>> | null = null;
let rideGraphReady = false;

export function isRideGraphReady(): boolean {
  return rideGraphReady;
}

/** Arcs de parcours. Sur le web, le fichier préparé reprend exactement le même graphe. */
export function loadRideGraph(onProgress?: (percent: number) => void): Promise<Map<number, RideLink[]>> {
  if (rideGraphReady) {
    onProgress?.(100);
  }
  if (!rideGraph) {
    const load = Platform.OS === "web" ? loadPackedRideGraph(onProgress).catch(() => buildRideGraph()) : buildRideGraph();
    rideGraph = load
      .then((graph) => {
        rideGraphReady = true;
        onProgress?.(100);
        return graph;
      })
      .catch((error: unknown) => {
        rideGraph = null;
        throw error;
      });
  }
  return rideGraph;
}

async function loadPackedRideGraph(onProgress?: (percent: number) => void): Promise<Map<number, RideLink[]>> {
  const url = typeof document === "undefined" ? "/ride-graph.json" : new URL("ride-graph.json", document.baseURI).href;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error("Le réseau préparé est indisponible.");
  }
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    chunks.push(chunk.value);
    received += chunk.value.byteLength;
    if (total > 0) {
      onProgress?.(Math.min(99, Math.round((received / total) * 100)));
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return unpackRideGraph(JSON.parse(new TextDecoder().decode(bytes)) as PackedRideGraph);
}

async function buildRideGraph(): Promise<Map<number, RideLink[]>> {
  const entries = await loadGtfsEntries();
  const routes = entries.get("routes.txt");
  const trips = entries.get("trips.txt");
  const stopTimes = entries.get("stop_times.txt");
  if (!routes || !trips || !stopTimes) {
    throw new Error("Le réseau théorique TCL est incomplet.");
  }
  return collectRideLinks(await inflateText(routes), await inflateText(trips), (onLine) => forEachDataLine(stopTimes, onLine));
}

/** Horaires des 20 prochaines heures, uniquement pour les arrêts demandés. */
export function loadDepartures(
  stopIds: number[],
  onProgress?: (message: string) => void,
  onFraction?: (ratio: number) => void,
): Promise<ScheduledDeparture[]> {
  const today = dayKey(new Date());
  if (cachedDay !== today) {
    cachedDay = today;
    cachedNext = new Map();
    nextScan = null;
  }
  const missing = [...new Set(stopIds)].filter((id) => !cachedNext.has(id));
  if (missing.length === 0) {
    return Promise.resolve(collectNext(stopIds));
  }
  const scan = (nextScan ?? Promise.resolve()).then(async () => {
    const still = missing.filter((id) => !cachedNext.has(id));
    if (still.length === 0) {
      return;
    }
    const found = await buildIndex(new Set(still), MAX_PER_DIRECTION, onProgress, onFraction);
    for (const id of still) {
      cachedNext.set(id, found.get(id) ?? []);
    }
  });
  nextScan = scan
    .catch((error: unknown) => {
      nextScan = null;
      throw error;
    });
  return nextScan.then(() => collectNext(stopIds));
}

function collectNext(stopIds: number[]): ScheduledDeparture[] {
  return stopIds
    .flatMap((id) => cachedNext.get(id) ?? [])
    .sort((left, right) => left.at - right.at);
}
