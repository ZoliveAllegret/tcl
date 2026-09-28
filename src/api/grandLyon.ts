import { grandLyonConfig } from "@/src/config";
import {
  formatSiriDelay,
  lineFromSiriRef,
  parseLines,
  refValue,
  stopIdFromSiriRef,
} from "@/src/format";
import { simplifyPath } from "@/src/geo";
import { lineColor, vehicleMarkerColor } from "@/src/theme";
import type { LatLng, Passage, Stop, Vehicle } from "@/src/types";

type TableResponse<T> = {
  values?: T[];
  nb_records?: number;
};

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

type RawPassage = {
  id: number;
  ligne: string;
  direction: string;
  delaipassage: string;
  heurepassage: string;
  type: string;
  idtarretdestination: number | null;
};

const PAGE_SIZE = 1000;

function authorizationHeader(): string {
  return `Basic ${globalThis.btoa(`${grandLyonConfig.username}:${grandLyonConfig.password}`)}`;
}

async function fetchJson<T>(url: string, cache?: RequestCache): Promise<T> {
  const response = await fetch(url, {
    cache,
    headers: {
      Accept: "application/json",
      Authorization: authorizationHeader(),
    },
  });
  if (!response.ok) {
    throw new Error(`Le service Grand Lyon a répondu ${response.status}.`);
  }
  return (await response.json()) as T;
}

function mapStop(row: RawStop): Stop {
  return {
    id: row.id,
    name: row.nom,
    commune: row.commune ?? "",
    address: row.adresse,
    latitude: row.lat,
    longitude: row.lon,
    lines: parseLines(row.desserte),
    wheelchair: Boolean(row.pmr),
  };
}

function mapPassage(row: RawPassage): Passage {
  return {
    stopId: row.id,
    line: row.ligne,
    direction: row.direction,
    delayLabel: row.delaipassage,
    scheduledAt: row.heurepassage,
    kind: row.type === "E" ? "estimated" : "theoretical",
    destinationStopId: row.idtarretdestination,
  };
}

export async function fetchAllStops(onProgress?: (loaded: number, total: number | null) => void): Promise<Stop[]> {
  const stops: Stop[] = [];
  const seen = new Set<number>();
  let start = 1;
  let total: number | null = null;
  try {
    const summary = await fetchJson<TableResponse<RawStop>>(grandLyonConfig.stopsUrl.replace(/\/all\.json$/, ".json"));
    if (typeof summary.nb_records === "number" && summary.nb_records > 0) {
      total = summary.nb_records;
    }
  } catch {
    total = null;
  }
  onProgress?.(0, total);

  while (start < 50_000) {
    const url = `${grandLyonConfig.stopsUrl}?compact=false&maxfeatures=${PAGE_SIZE}&start=${start}`;
    const page = await fetchJson<TableResponse<RawStop>>(url);
    const values = page.values ?? [];
    let added = 0;
    for (const row of values) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      stops.push(mapStop(row));
      added += 1;
    }
    onProgress?.(stops.length, total);
    if (added === 0 || values.length < PAGE_SIZE) {
      break;
    }
    start += PAGE_SIZE;
  }

  stops.sort((left, right) => left.name.localeCompare(right.name, "fr"));
  return stops;
}

export async function fetchPassages(stopId: number): Promise<Passage[]> {
  const params = new URLSearchParams({
    compact: "false",
    maxfeatures: "100",
    field: "id",
    value: String(stopId),
  });
  const page = await fetchJson<TableResponse<RawPassage>>(`${grandLyonConfig.passagesUrl}?${params}`);
  return (page.values ?? [])
    .map(mapPassage)
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

type SiriResponse = {
  Siri?: {
    ServiceDelivery?: {
      VehicleMonitoringDelivery?: Array<{
        VehicleActivity?: unknown;
      }>;
    };
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function asActivities(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
  }
  const single = asRecord(value);
  return single ? [single] : [];
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const payload = await fetchJson<SiriResponse>(grandLyonConfig.vehiclesUrl, "no-store");
  const delivery = payload.Siri?.ServiceDelivery?.VehicleMonitoringDelivery?.[0];
  const activities = asActivities(delivery?.VehicleActivity);
  const vehicles: Vehicle[] = [];

  for (const activity of activities) {
    const journey = asRecord(activity.MonitoredVehicleJourney);
    const location = asRecord(journey?.VehicleLocation);
    const latitude = Number(location?.Latitude);
    const longitude = Number(location?.Longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    const id = refValue(journey?.VehicleRef) ?? refValue(activity.VehicleMonitoringRef) ?? `${latitude},${longitude}`;
    const bearing = Number(journey?.Bearing);
    vehicles.push({
      id,
      line: lineFromSiriRef(refValue(journey?.LineRef)),
      latitude,
      longitude,
      bearing: Number.isFinite(bearing) ? bearing : null,
      delayLabel: formatSiriDelay(typeof journey?.Delay === "string" ? journey.Delay : null),
      destinationStopId: stopIdFromSiriRef(refValue(journey?.DestinationRef)),
      recordedAt: typeof activity.RecordedAtTime === "string" ? activity.RecordedAtTime : null,
    });
  }

  return vehicles;
}

export type Disruption = {
  id: string;
  message: string;
  until: string | null;
};

type DisruptionRecord = {
  id: string;
  message: string;
  until: number | null;
};

let disruptionCatalog: Promise<Map<string, DisruptionRecord[]>> | null = null;

function loadDisruptionCatalog(): Promise<Map<string, DisruptionRecord[]>> {
  if (!disruptionCatalog) {
    disruptionCatalog = buildDisruptionCatalog().catch((error: unknown) => {
      disruptionCatalog = null;
      throw error;
    });
  }
  return disruptionCatalog;
}

async function buildDisruptionCatalog(): Promise<Map<string, DisruptionRecord[]>> {
  const payload = await fetchJson<unknown>(grandLyonConfig.disruptionsUrl, "no-store");
  const now = Date.now();
  const byLine = new Map<string, Map<string, DisruptionRecord>>();
  for (const situation of situationElements(payload)) {
    if (!isCurrentSituation(situation, now)) {
      continue;
    }
    const message = messageOf(situation);
    if (!message) {
      continue;
    }
    const record: DisruptionRecord = {
      id: incidentId(situation),
      message,
      until: endOfCurrentPeriod(situation, now),
    };
    for (const code of lineCodesOf(situation)) {
      const incidents = byLine.get(code) ?? new Map<string, DisruptionRecord>();
      const existing = incidents.get(record.id);
      if (!existing || record.message.length > existing.message.length) {
        incidents.set(record.id, record);
      }
      byLine.set(code, incidents);
    }
  }
  return new Map([...byLine].map(([code, incidents]) => [code, [...incidents.values()]]));
}

function toDisruption(record: DisruptionRecord): Disruption {
  return {
    id: record.id,
    message: record.message,
    until: record.until == null ? null : formatDisruptionDate(record.until),
  };
}

/** Nombre d'incidents en cours par code de ligne. Les messages aller/retour d'un même incident ne comptent qu'une fois. */
export async function fetchDisruptionCounts(): Promise<Record<string, number>> {
  const catalog = await loadDisruptionCatalog();
  return Object.fromEntries([...catalog].map(([code, items]) => [code, items.length]));
}

export async function fetchLineDisruptions(code: string): Promise<Disruption[]> {
  const catalog = await loadDisruptionCatalog();
  return (catalog.get(code) ?? []).map(toDisruption);
}

function messageOf(situation: Record<string, unknown>): string {
  return asActivities(situation.Description)
    .map((item) => (typeof item.value === "string" ? item.value.trim() : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function endOfCurrentPeriod(situation: Record<string, unknown>, now: number): number | null {
  let latest: number | null = null;
  for (const period of asActivities(situation.ValidityPeriod)) {
    const start = parseSiriTime(period.StartTime);
    const end = parseSiriTime(period.EndTime);
    if (start != null && end != null && start <= now && now <= end) {
      latest = latest == null ? end : Math.max(latest, end);
    }
  }
  return latest;
}

function formatDisruptionDate(time: number): string {
  return new Date(time).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function situationElements(payload: unknown): Record<string, unknown>[] {
  const siri = asRecord(asRecord(payload)?.Siri);
  const delivery = asRecord(siri?.ServiceDelivery);
  const exchange = asActivities(delivery?.SituationExchangeDelivery)[0];
  const situations = asRecord(exchange?.Situations);
  return asActivities(situations?.PtSituationElement);
}

function lineCodesOf(situation: Record<string, unknown>): string[] {
  const codes = new Set<string>();
  const consequences = asRecord(situation.Consequences);
  for (const consequence of asActivities(consequences?.Consequence)) {
    const affects = asRecord(consequence.Affects);
    const networks = asRecord(affects?.Networks);
    for (const network of asActivities(networks?.AffectedNetwork)) {
      for (const line of asActivities(network.AffectedLine)) {
        const code = lineFromSiriRef(refValue(line.LineRef));
        if (code !== "?") {
          codes.add(code);
        }
      }
    }
  }
  return [...codes];
}

function incidentId(situation: Record<string, unknown>): string {
  const references = asRecord(situation.References);
  const related = asActivities(references?.RelatedToRef)[0];
  return refValue(related?.SituationNumber) ?? refValue(situation.SituationNumber) ?? "";
}

function isCurrentSituation(situation: Record<string, unknown>, now: number): boolean {
  const periods = asActivities(situation.ValidityPeriod);
  if (periods.length === 0) {
    return true;
  }
  return periods.some((period) => {
    const start = parseSiriTime(period.StartTime);
    const end = parseSiriTime(period.EndTime);
    return start != null && end != null && start <= now && now <= end;
  });
}

function parseSiriTime(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(time) ? time : null;
}

export type LineTrace = {
  code: string;
  color: string;
  paths: LatLng[][];
};

const TRACE_TOLERANCE_METERS = 30;
const traceCache = new Map<string, Promise<LineTrace | null>>();

function collectionsFor(code: string): string[] {
  const { metro, tram, bus } = grandLyonConfig.lineCollections;
  if (/^[ABCD]$/.test(code) || /^F\d+$/.test(code)) {
    return [metro, tram, bus];
  }
  if (/^T\d/.test(code)) {
    return [tram, bus, metro];
  }
  return [bus, tram, metro];
}

function traceColor(code: string, hex: string | null | undefined): string {
  if (hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return hex;
  }
  return vehicleMarkerColor(lineColor(code));
}

function pathFromCoordinates(coordinates: unknown): LatLng[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  const points: LatLng[] = [];
  for (const pair of coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) {
      continue;
    }
    const longitude = Number(pair[0]);
    const latitude = Number(pair[1]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      points.push({ latitude, longitude });
    }
  }
  const simplified = simplifyPath(points, TRACE_TOLERANCE_METERS);
  return simplified.length >= 2 ? simplified : [];
}

function pathsFromGeometry(geometry: { type?: string; coordinates?: unknown } | undefined): LatLng[][] {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }
  if (geometry.type === "LineString") {
    const path = pathFromCoordinates(geometry.coordinates);
    return path.length >= 2 ? [path] : [];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates
      .map((ring) => pathFromCoordinates(ring))
      .filter((path) => path.length >= 2);
  }
  return [];
}

async function loadLineTrace(code: string): Promise<LineTrace | null> {
  if (!/^[A-Za-z0-9]+$/.test(code)) {
    return null;
  }
  let color = traceColor(code, null);
  const paths: LatLng[][] = [];
  for (const collection of collectionsFor(code)) {
    const params = new URLSearchParams({
      f: "application/geo+json",
      limit: "100",
      filter: `ligne='${code}'`,
      "filter-lang": "cql-text",
    });
    const url = `https://data.grandlyon.com/geoserver/ogc/features/v1/collections/${collection}/items?${params}`;
    const payload = await fetchJson<{
      features?: Array<{
        properties?: { couleur_hex?: string | null };
        geometry?: { type?: string; coordinates?: unknown };
      }>;
    }>(url);
    const features = payload.features ?? [];
    if (features.length === 0) {
      continue;
    }
    color = traceColor(code, features[0]?.properties?.couleur_hex);
    for (const feature of features) {
      paths.push(...pathsFromGeometry(feature.geometry));
    }
    break;
  }
  if (paths.length === 0) {
    return null;
  }
  return { code, color, paths };
}

/** Tracé officiel d'une ligne (aller, retour et variantes). */
export function fetchLineTrace(code: string): Promise<LineTrace | null> {
  const key = code.toUpperCase();
  const cached = traceCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = loadLineTrace(key).catch((error: unknown) => {
    traceCache.delete(key);
    throw error;
  });
  traceCache.set(key, pending);
  return pending;
}
