import { grandLyonConfig } from "@/src/config";

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
let cachedIndex: Promise<Map<number, ScheduledDeparture[]>> | null = null;
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

function readZipEntries(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      break;
    }
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if ((flags & 8) !== 0 || method !== 8) {
      throw new Error("Le fichier d'horaires TCL a un format inattendu.");
    }
    entries.set(name, bytes.subarray(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }

  return entries;
}

function inflateStream(data: Uint8Array): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
}

async function inflateText(data: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await new Response(inflateStream(data)).arrayBuffer());
}

async function forEachDataLine(data: Uint8Array, onLine: (line: string) => void): Promise<void> {
  const stream = inflateStream(data);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const consume = (flush: boolean) => {
    pending += flush ? decoder.decode() : "";
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      let line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      if (line) {
        onLine(line);
      }
      newline = pending.indexOf("\n");
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      consume(true);
      if (pending) {
        onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
      }
      return;
    }
    pending += decoder.decode(chunk.value, { stream: true });
    consume(false);
  }
}

function rememberTime(group: DirectionGroup, at: number) {
  if (group.times.includes(at)) {
    return;
  }
  if (group.times.length < MAX_PER_DIRECTION) {
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

async function loadGtfsEntries(): Promise<Map<string, Uint8Array>> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Cet appareil ne peut pas ouvrir le fichier d'horaires TCL.");
  }
  if (!gtfsEntries) {
    gtfsEntries = fetch(grandLyonConfig.gtfsUrl, {
      headers: {
        Authorization: authorizationHeader(),
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Les horaires théoriques ont répondu ${response.status}.`);
        }
        return readZipEntries(await response.arrayBuffer());
      })
      .catch((error: unknown) => {
        gtfsEntries = null;
        throw error;
      });
  }
  return gtfsEntries;
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

async function buildIndex(onProgress?: (message: string) => void): Promise<Map<number, ScheduledDeparture[]>> {
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
  const tripLines = (await inflateText(entries.get("trips.txt")!)).split("\n");
  const tripHeader = tripLines[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const tripIndex = Object.fromEntries(tripHeader.map((name, index) => [name.trim(), index]));
  for (const rawLine of tripLines.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = line.split(",");
    const activeDays = services.get(fields[tripIndex.service_id]);
    if (!activeDays || activeDays.size === 0) {
      continue;
    }
    trips.set(fields[tripIndex.trip_id], {
      line: routeNames.get(fields[tripIndex.route_id]) ?? "?",
      direction: fields[tripIndex.trip_headsign] || "Direction inconnue",
      days: [...activeDays],
    });
  }

  onProgress?.("Lecture des heures de passage…");
  const groups = new Map<number, Map<string, DirectionGroup>>();
  let seen = 0;
  await forEachDataLine(entries.get("stop_times.txt")!, (line) => {
    seen += 1;
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
    if (!Number.isFinite(stopId)) {
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
      rememberTime(group, at);
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

export type RideLink = {
  to: number;
  line: string;
  direction: string;
  minutes: number;
};

let rideGraph: Promise<Map<number, RideLink[]>> | null = null;

/** Arcs de parcours : chaque course relie ses arrêts successifs, variantes comprises. */
export function loadRideGraph(): Promise<Map<number, RideLink[]>> {
  if (!rideGraph) {
    rideGraph = buildRideGraph().catch((error: unknown) => {
      rideGraph = null;
      throw error;
    });
  }
  return rideGraph;
}

async function buildRideGraph(): Promise<Map<number, RideLink[]>> {
  const entries = await loadGtfsEntries();
  const routes = entries.get("routes.txt");
  const trips = entries.get("trips.txt");
  const stopTimes = entries.get("stop_times.txt");
  if (!routes || !trips || !stopTimes) {
    throw new Error("Le réseau théorique TCL est incomplet.");
  }

  const routeToCode = new Map<string, string>();
  const routeLines = (await inflateText(routes)).split("\n");
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
  const tripLines = (await inflateText(trips)).split("\n");
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
  await forEachDataLine(stopTimes, (line) => {
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

export function loadDepartures(stopId: number, onProgress?: (message: string) => void): Promise<ScheduledDeparture[]> {
  const today = dayKey(new Date());
  if (!cachedIndex || cachedDay !== today) {
    cachedDay = today;
    cachedIndex = buildIndex(onProgress).catch((error: unknown) => {
      cachedIndex = null;
      throw error;
    });
  }
  return cachedIndex.then((index) => index.get(stopId) ?? []);
}
