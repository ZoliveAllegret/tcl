import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { grandLyonConfig } from "../src/config.ts";
import { parseLines } from "../src/format.ts";
import { forEachDataLine, inflateText, readZipEntries } from "../src/schedule/gtfsZip.ts";
import { encodeTimetable, type DepartureGroup, type PreparedTimetable, type TimetableService } from "../src/schedule/timetable.ts";
import type { Stop } from "../src/types.ts";

const WEEKDAY_BITS: Array<[string, number]> = [
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6],
];

type RawStop = {
  id: number;
  nom: string;
  commune: string | null;
  adresse: string | null;
  lat: number;
  lon: number;
  desserte: string | null;
  pmr: boolean | null;
};

function authHeader(): string {
  return `Basic ${Buffer.from(`${grandLyonConfig.username}:${grandLyonConfig.password}`).toString("base64")}`;
}

function fingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

function splitCsv(line: string): string[] {
  if (!line.includes('"')) {
    return line.split(",");
  }
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function headerIndex(line: string): Record<string, number> {
  return Object.fromEntries(
    splitCsv(line.replace(/^\uFEFF/, "").replace(/\r$/, "")).map((name, index) => [name.trim(), index]),
  );
}

function minutesOf(value: string): number | null {
  const [hours, minutes] = value.split(":");
  const hour = Number(hours);
  const minute = Number(minutes);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

async function fetchStops(): Promise<Stop[]> {
  const stops: Stop[] = [];
  const seen = new Set<number>();
  let start = 1;
  while (start < 50_000) {
    const url = `${grandLyonConfig.stopsUrl}?compact=false&maxfeatures=1000&start=${start}`;
    const response = await fetch(url, { headers: { Accept: "application/json", Authorization: authHeader() } });
    if (!response.ok) {
      throw new Error(`Les arrêts ont répondu ${response.status}.`);
    }
    const page = (await response.json()) as { values?: RawStop[] };
    const values = page.values ?? [];
    let added = 0;
    for (const row of values) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      stops.push({
        id: row.id,
        name: row.nom,
        commune: row.commune ?? "",
        address: row.adresse,
        latitude: row.lat,
        longitude: row.lon,
        lines: parseLines(row.desserte),
        wheelchair: Boolean(row.pmr),
      });
      added += 1;
    }
    console.log(`Arrêts ${stops.length}`);
    if (added === 0 || values.length < 1000) {
      break;
    }
    start += 1000;
  }
  stops.sort((left, right) => left.name.localeCompare(right.name, "fr"));
  return stops;
}

async function fetchGtfs(): Promise<Map<string, Uint8Array>> {
  const response = await fetch(grandLyonConfig.gtfsUrl, { headers: { Authorization: authHeader() } });
  if (!response.ok) {
    throw new Error(`Les horaires théoriques ont répondu ${response.status}.`);
  }
  return readZipEntries(await response.arrayBuffer());
}

function serviceOf(fields: string[], index: Record<string, number>): TimetableService {
  let days = 0;
  for (const [name, bit] of WEEKDAY_BITS) {
    if (fields[index[name]] === "1") {
      days |= 1 << bit;
    }
  }
  return {
    days,
    start: Number(fields[index.start_date]),
    end: Number(fields[index.end_date]),
    add: [],
    remove: [],
  };
}

async function buildTimetable(entries: Map<string, Uint8Array>): Promise<PreparedTimetable> {
  const calendarText = await inflateText(entries.get("calendar.txt")!);
  const calendarLines = calendarText.split("\n").map((line) => line.replace(/\r$/, "")).filter(Boolean);
  const calendarIndex = headerIndex(calendarLines[0] ?? "");
  const services: TimetableService[] = [];
  const serviceIndex = new Map<string, number>();
  for (const rawLine of calendarLines.slice(1)) {
    const fields = splitCsv(rawLine.replace(/\r$/, ""));
    const id = fields[calendarIndex.service_id];
    if (!id || serviceIndex.has(id)) {
      continue;
    }
    serviceIndex.set(id, services.length);
    services.push(serviceOf(fields, calendarIndex));
  }

  const exceptions = (await inflateText(entries.get("calendar_dates.txt")!)).split("\n");
  const exceptionIndex = headerIndex(exceptions[0] ?? "");
  for (const rawLine of exceptions.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = splitCsv(line);
    const id = fields[exceptionIndex.service_id];
    if (!id) {
      continue;
    }
    let index = serviceIndex.get(id);
    if (index == null) {
      index = services.length;
      serviceIndex.set(id, index);
      services.push({ days: 0, start: 0, end: 0, add: [], remove: [] });
    }
    const date = Number(fields[exceptionIndex.date]);
    const service = services[index];
    if (!service || !Number.isFinite(date)) {
      continue;
    }
    if (fields[exceptionIndex.exception_type] === "1") {
      service.add.push(date);
    } else if (fields[exceptionIndex.exception_type] === "2") {
      service.remove.push(date);
    }
  }

  const routes = (await inflateText(entries.get("routes.txt")!)).split("\n");
  const routeIndex = headerIndex(routes[0] ?? "");
  const lines: string[] = [];
  const names: string[] = [];
  const lineIndex = new Map<string, number>();
  const routeLine = new Map<string, number>();
  for (const rawLine of routes.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = splitCsv(line);
    const routeId = fields[routeIndex.route_id];
    const code = fields[routeIndex.route_short_name];
    if (!routeId || !code) {
      continue;
    }
    let index = lineIndex.get(code);
    if (index == null) {
      index = lines.length;
      lineIndex.set(code, index);
      lines.push(code);
      names.push(fields[routeIndex.route_long_name] || code);
    } else if ((fields[routeIndex.route_long_name] ?? "").length > (names[index] ?? "").length) {
      names[index] = fields[routeIndex.route_long_name] ?? code;
    }
    routeLine.set(routeId, index);
  }

  const directions: string[] = [];
  const directionIndex = new Map<string, number>();
  const directionOf = (value: string) => {
    const label = value || "Direction inconnue";
    let index = directionIndex.get(label);
    if (index == null) {
      index = directions.length;
      directionIndex.set(label, index);
      directions.push(label);
    }
    return index;
  };

  const trips = new Map<string, { line: number; direction: number; service: number }>();
  let tripHeader = true;
  let tripColumns: Record<string, number> = {};
  await forEachDataLine(entries.get("trips.txt")!, (rawLine) => {
    const fields = splitCsv(rawLine.replace(/^\uFEFF/, ""));
    if (tripHeader) {
      tripHeader = false;
      tripColumns = Object.fromEntries(fields.map((name, index) => [name.trim(), index]));
      return;
    }
    const service = serviceIndex.get(fields[tripColumns.service_id] ?? "");
    const line = routeLine.get(fields[tripColumns.route_id] ?? "");
    const tripId = fields[tripColumns.trip_id];
    if (service == null || line == null || !tripId) {
      return;
    }
    trips.set(tripId, {
      line,
      direction: directionOf(fields[tripColumns.trip_headsign] ?? ""),
      service,
    });
  });

  const byStop = new Map<number, Map<string, DepartureGroup>>();
  let seen = 0;
  let header = true;
  let columns: Record<string, number> = {};
  await forEachDataLine(entries.get("stop_times.txt")!, (rawLine) => {
    seen += 1;
    if (seen % 400_000 === 0) {
      console.log(`Passages ${seen}`);
    }
    const fields = splitCsv(rawLine.replace(/^\uFEFF/, ""));
    if (header) {
      header = false;
      if (fields[0] === "trip_id") {
        columns = Object.fromEntries(fields.map((name, index) => [name.trim(), index]));
        return;
      }
    }
    const trip = trips.get(fields[columns.trip_id ?? 0] ?? "");
    if (!trip || fields[columns.pickup_type ?? 6] === "1") {
      return;
    }
    const stopId = Number(fields[columns.stop_id ?? 3]);
    const minute = minutesOf(fields[columns.departure_time ?? 2] ?? "");
    if (!Number.isFinite(stopId) || minute == null) {
      return;
    }
    const groups = byStop.get(stopId) ?? new Map<string, DepartureGroup>();
    const key = `${trip.line}:${trip.direction}:${trip.service}`;
    const group = groups.get(key) ?? { line: trip.line, direction: trip.direction, service: trip.service, minutes: [] };
    group.minutes.push(minute);
    groups.set(key, group);
    byStop.set(stopId, groups);
  });

  const packed = new Map<number, DepartureGroup[]>();
  for (const [stopId, groups] of byStop) {
    packed.set(stopId, [...groups.values()]);
  }
  console.log(`Arrêts horaires ${packed.size}, lignes ${lines.length}, services ${services.length}`);
  return { lines, names, directions, services, byStop: packed };
}

/** Pour chaque ligne, l'ordre des arrêts du trajet GTFS le plus long. */
async function buildLineOrder(entries: Map<string, Uint8Array>): Promise<Record<string, number[]>> {
  const routes = (await inflateText(entries.get("routes.txt")!)).split("\n");
  const routeIndex = headerIndex(routes[0] ?? "");
  const routeLine = new Map<string, string>();
  for (const rawLine of routes.slice(1)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) {
      continue;
    }
    const fields = splitCsv(line);
    const routeId = fields[routeIndex.route_id];
    const code = fields[routeIndex.route_short_name];
    if (routeId && code) {
      routeLine.set(routeId, code);
    }
  }

  const tripLine = new Map<string, string>();
  let tripHeader = true;
  let tripColumns: Record<string, number> = {};
  await forEachDataLine(entries.get("trips.txt")!, (rawLine) => {
    const fields = splitCsv(rawLine.replace(/^\uFEFF/, ""));
    if (tripHeader) {
      tripHeader = false;
      tripColumns = Object.fromEntries(fields.map((name, index) => [name.trim(), index]));
      return;
    }
    const tripId = fields[tripColumns.trip_id];
    const code = routeLine.get(fields[tripColumns.route_id] ?? "");
    if (tripId && code) {
      tripLine.set(tripId, code);
    }
  });

  const byTrip = new Map<string, { seq: number; stopId: number }[]>();
  let header = true;
  let columns: Record<string, number> = {};
  await forEachDataLine(entries.get("stop_times.txt")!, (rawLine) => {
    const fields = splitCsv(rawLine.replace(/^\uFEFF/, ""));
    if (header) {
      header = false;
      if (fields[0] === "trip_id") {
        columns = Object.fromEntries(fields.map((name, index) => [name.trim(), index]));
        return;
      }
    }
    const tripId = fields[columns.trip_id ?? 0];
    if (!tripLine.has(tripId ?? "")) {
      return;
    }
    const stopId = Number(fields[columns.stop_id ?? 3]);
    const seq = Number(fields[columns.stop_sequence ?? 4]);
    if (!Number.isFinite(stopId) || !Number.isFinite(seq)) {
      return;
    }
    const rows = byTrip.get(tripId!) ?? [];
    rows.push({ seq, stopId });
    byTrip.set(tripId!, rows);
  });

  const best = new Map<string, number[]>();
  for (const [tripId, line] of tripLine) {
    const ordered = (byTrip.get(tripId) ?? []).sort((left, right) => left.seq - right.seq).map((row) => row.stopId);
    const stops: number[] = [];
    for (const stopId of ordered) {
      if (stops[stops.length - 1] !== stopId) {
        stops.push(stopId);
      }
    }
    const previous = best.get(line);
    if (!previous || stops.length > previous.length) {
      best.set(line, stops);
    }
  }
  console.log(`Ordre de passage ${best.size} lignes`);
  return Object.fromEntries(best);
}

const directory = new URL("../public/data/", import.meta.url);
mkdirSync(directory, { recursive: true });

const [stops, entries] = await Promise.all([fetchStops(), fetchGtfs()]);
const timetable = encodeTimetable(await buildTimetable(entries));
const lineOrder = await buildLineOrder(entries);
const stopsBytes = new TextEncoder().encode(JSON.stringify(stops));
const lineOrderBytes = new TextEncoder().encode(JSON.stringify(lineOrder));
const manifest = {
  stops: fingerprint(stopsBytes),
  timetable: fingerprint(timetable),
  lineOrder: fingerprint(lineOrderBytes),
};

writeFileSync(new URL("stops.json", directory), stopsBytes);
writeFileSync(new URL("timetable.bin", directory), timetable);
writeFileSync(new URL("line-order.json", directory), lineOrderBytes);
writeFileSync(new URL("manifest.json", directory), JSON.stringify(manifest));
console.log(
  `stops.json ${stopsBytes.byteLength} o, timetable.bin ${timetable.byteLength} o, line-order.json ${lineOrderBytes.byteLength} o, manifeste ${JSON.stringify(manifest)}`,
);
