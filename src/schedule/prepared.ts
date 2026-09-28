import type { Stop } from "@/src/types";
import { decodeTimetable, type PreparedTimetable } from "@/src/schedule/timetable";

export type DataManifest = {
  stops: string;
  timetable: string;
};

const DATA_CACHE = "tcl-data-v1";

type CachedStops = { hash: string; stops: Stop[] };
type CachedTimetable = { hash: string; table: PreparedTimetable };

let memoryStops: CachedStops | null = null;
let memoryTable: CachedTimetable | null = null;
let manifestTask: Promise<DataManifest> | null = null;
let hydrateTask: Promise<void> | null = null;
let checkTask: Promise<void> | null = null;
const stopListeners = new Set<(loaded: number, total: number | null) => void>();
const updateListeners = new Set<(stops: Stop[]) => void>();

function dataUrl(file: string): string {
  if (typeof document === "undefined") {
    return `/data/${file}`;
  }
  return new URL(`data/${file}`, document.baseURI).href;
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", copyBytes(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

async function download(url: string, onProgress?: (loaded: number, total: number | null) => void): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new Error("Les données préparées sont indisponibles.");
  }
  const total = Number(response.headers.get("content-length")) || null;
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
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function remember(url: string, bytes: Uint8Array, contentType: string, hash: string): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.put(
      url,
      new Response(copyBytes(bytes), {
        headers: {
          "content-type": contentType,
          "x-tcl-hash": hash,
        },
      }),
    );
  } catch {
    // Un quota plein n'empêche pas d'utiliser les données déjà en mémoire.
  }
}

async function readCached(url: string): Promise<{ hash: string; bytes: Uint8Array } | null> {
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    const cache = await caches.open(DATA_CACHE);
    const response = await cache.match(url);
    const hash = response?.headers.get("x-tcl-hash");
    if (!response || !hash) {
      return null;
    }
    return { hash, bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch {
    return null;
  }
}

function currentStops(): CachedStops | null {
  return memoryStops;
}

function currentTimetable(): CachedTimetable | null {
  return memoryTable;
}

function loadManifest(): Promise<DataManifest> {
  if (!manifestTask) {
    manifestTask = fetch(dataUrl("manifest.json"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Le manifeste des données est indisponible.");
        }
        const body = (await response.json()) as DataManifest;
        if (!body.stops || !body.timetable) {
          throw new Error("Le manifeste des données est incomplet.");
        }
        return body;
      })
      .catch((error: unknown) => {
        manifestTask = null;
        throw error;
      });
  }
  return manifestTask;
}

async function hydrate(): Promise<void> {
  if (!hydrateTask) {
    hydrateTask = (async () => {
      if (!memoryStops) {
        const cached = await readCached(dataUrl("stops.json"));
        if (cached) {
          memoryStops = { hash: cached.hash, stops: JSON.parse(new TextDecoder().decode(cached.bytes)) as Stop[] };
        }
      }
      if (!memoryTable) {
        const cached = await readCached(dataUrl("timetable.bin"));
        if (cached) {
          memoryTable = { hash: cached.hash, table: decodeTimetable(cached.bytes) };
        }
      }
    })().catch((error: unknown) => {
      hydrateTask = null;
      throw error;
    });
  }
  return hydrateTask;
}

async function syncStops(manifest: DataManifest): Promise<void> {
  if (memoryStops?.hash === manifest.stops) {
    return;
  }
  const previous = memoryStops;
  const bytes = await download(dataUrl("stops.json"), (loaded, total) => {
    for (const listener of stopListeners) {
      listener(loaded, total);
    }
  });
  const hash = await fingerprint(bytes);
  if (hash !== manifest.stops) {
    throw new Error("La liste des arrêts ne correspond pas à la version annoncée.");
  }
  const stops = JSON.parse(new TextDecoder().decode(bytes)) as Stop[];
  memoryStops = { hash, stops };
  await remember(dataUrl("stops.json"), bytes, "application/json", hash);
  if (previous) {
    for (const listener of updateListeners) {
      listener(stops);
    }
  }
}

async function syncTimetable(manifest: DataManifest): Promise<void> {
  if (memoryTable?.hash === manifest.timetable) {
    return;
  }
  const bytes = await download(dataUrl("timetable.bin"));
  const hash = await fingerprint(bytes);
  if (hash !== manifest.timetable) {
    throw new Error("Les horaires préparés ne correspondent pas à la version annoncée.");
  }
  memoryTable = { hash, table: decodeTimetable(bytes) };
  await remember(dataUrl("timetable.bin"), bytes, "application/octet-stream", hash);
}

function checkForUpdates(): Promise<void> {
  if (!checkTask) {
    checkTask = (async () => {
      const manifest = await loadManifest();
      await Promise.all([syncStops(manifest), syncTimetable(manifest)]);
    })().catch((error: unknown) => {
      checkTask = null;
      throw error;
    });
  }
  return checkTask;
}

/** Au lancement : manifeste seul si les fichiers en cache ont déjà cette version. */
export function warmPreparedData(): void {
  if (typeof window === "undefined") {
    return;
  }
  void hydrate()
    .then(() => checkForUpdates())
    .catch(() => undefined);
}

export async function loadPreparedStops(
  onProgress?: (loaded: number, total: number | null) => void,
  onUpdate?: (stops: Stop[]) => void,
): Promise<Stop[]> {
  if (onProgress) {
    stopListeners.add(onProgress);
  }
  if (onUpdate) {
    updateListeners.add(onUpdate);
  }
  try {
    await hydrate();
    if (memoryStops) {
      void checkForUpdates().catch(() => undefined);
      return memoryStops.stops;
    }
    await checkForUpdates();
    const ready = currentStops();
    if (!ready) {
      throw new Error("La liste des arrêts préparée est indisponible.");
    }
    return ready.stops;
  } finally {
    if (onProgress) {
      stopListeners.delete(onProgress);
    }
  }
}

export async function loadPreparedTimetable(): Promise<PreparedTimetable> {
  await hydrate();
  if (memoryTable) {
    void checkForUpdates().catch(() => undefined);
    return memoryTable.table;
  }
  await checkForUpdates();
  const ready = currentTimetable();
  if (!ready) {
    throw new Error("Les horaires préparés sont indisponibles.");
  }
  return ready.table;
}
