export type TimetableService = {
  /** Bits du dimanche (0) au samedi (6), comme Date.getDay(). */
  days: number;
  start: number;
  end: number;
  add: number[];
  remove: number[];
};

export type DepartureGroup = {
  line: number;
  direction: number;
  service: number;
  minutes: number[];
};

export type PreparedTimetable = {
  lines: string[];
  names: string[];
  directions: string[];
  services: TimetableService[];
  byStop: Map<number, DepartureGroup[]>;
};

export type ClockDeparture = {
  line: string;
  direction: string;
  time: string;
  at: number;
};

export type LineDayBoard = {
  direction: string;
  times: string[];
};

const MAGIC = 0x544c4354;
const VERSION = 1;

class Buf {
  private bytes = new Uint8Array(1024 * 1024);
  private offset = 0;

  private ensure(size: number) {
    if (this.offset + size <= this.bytes.length) {
      return;
    }
    let nextSize = this.bytes.length;
    while (this.offset + size > nextSize) {
      nextSize *= 2;
    }
    const next = new Uint8Array(nextSize);
    next.set(this.bytes);
    this.bytes = next;
  }

  u8(value: number) {
    this.ensure(1);
    this.bytes[this.offset] = value & 255;
    this.offset += 1;
  }

  u16(value: number) {
    this.ensure(2);
    this.bytes[this.offset] = (value >> 8) & 255;
    this.bytes[this.offset + 1] = value & 255;
    this.offset += 2;
  }

  u32(value: number) {
    this.ensure(4);
    this.bytes[this.offset] = (value >>> 24) & 255;
    this.bytes[this.offset + 1] = (value >>> 16) & 255;
    this.bytes[this.offset + 2] = (value >>> 8) & 255;
    this.bytes[this.offset + 3] = value & 255;
    this.offset += 4;
  }

  text(value: string) {
    const data = new TextEncoder().encode(value);
    if (data.length > 65535) {
      throw new Error("Texte trop long pour les horaires préparés.");
    }
    this.u16(data.length);
    this.ensure(data.length);
    this.bytes.set(data, this.offset);
    this.offset += data.length;
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.offset);
  }
}

class Reader {
  private offset = 0;
  private view: DataView;

  constructor(view: DataView) {
    this.view = view;
  }

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  text(): string {
    const length = this.u16();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }
}

function uniqueMinutes(minutes: number[]): number[] {
  const sorted = [...new Set(minutes.filter((minute) => minute >= 0 && minute <= 65535))].sort((left, right) => left - right);
  return sorted;
}

/** Écrit le calendrier hebdomadaire et les minutes de passage de chaque arrêt. */
export function encodeTimetable(table: PreparedTimetable): Uint8Array {
  const buf = new Buf();
  buf.u32(MAGIC);
  buf.u16(VERSION);
  buf.u16(table.lines.length);
  for (let index = 0; index < table.lines.length; index += 1) {
    buf.text(table.lines[index] ?? "");
    buf.text(table.names[index] ?? "");
  }
  buf.u16(table.directions.length);
  for (const direction of table.directions) {
    buf.text(direction);
  }
  buf.u16(table.services.length);
  for (const service of table.services) {
    buf.u8(service.days);
    buf.u32(service.start);
    buf.u32(service.end);
    buf.u16(service.add.length);
    for (const date of service.add) {
      buf.u32(date);
    }
    buf.u16(service.remove.length);
    for (const date of service.remove) {
      buf.u32(date);
    }
  }
  buf.u32(table.byStop.size);
  for (const [stopId, groups] of table.byStop) {
    const packed = groups
      .map((group) => ({ ...group, minutes: uniqueMinutes(group.minutes) }))
      .filter((group) => group.minutes.length > 0);
    buf.u32(stopId);
    buf.u16(packed.length);
    for (const group of packed) {
      buf.u16(group.line);
      buf.u16(group.direction);
      buf.u16(group.service);
      buf.u16(group.minutes.length);
      buf.u16(group.minutes[0] ?? 0);
      let previous = group.minutes[0] ?? 0;
      for (let index = 1; index < group.minutes.length; index += 1) {
        const minute = group.minutes[index] ?? previous;
        const delta = minute - previous;
        if (delta > 0 && delta < 256) {
          buf.u8(delta);
        } else {
          buf.u8(0);
          buf.u16(minute);
        }
        previous = minute;
      }
    }
  }
  return buf.finish();
}

export function decodeTimetable(bytes: Uint8Array): PreparedTimetable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reader = new Reader(view);
  if (reader.u32() !== MAGIC || reader.u16() !== VERSION) {
    throw new Error("Les horaires préparés sont illisibles.");
  }
  const lineCount = reader.u16();
  const lines: string[] = [];
  const names: string[] = [];
  for (let index = 0; index < lineCount; index += 1) {
    lines.push(reader.text());
    names.push(reader.text());
  }
  const directionCount = reader.u16();
  const directions: string[] = [];
  for (let index = 0; index < directionCount; index += 1) {
    directions.push(reader.text());
  }
  const serviceCount = reader.u16();
  const services: TimetableService[] = [];
  for (let index = 0; index < serviceCount; index += 1) {
    const days = reader.u8();
    const start = reader.u32();
    const end = reader.u32();
    const addCount = reader.u16();
    const add: number[] = [];
    for (let date = 0; date < addCount; date += 1) {
      add.push(reader.u32());
    }
    const removeCount = reader.u16();
    const remove: number[] = [];
    for (let date = 0; date < removeCount; date += 1) {
      remove.push(reader.u32());
    }
    services.push({ days, start, end, add, remove });
  }
  const stopCount = reader.u32();
  const byStop = new Map<number, DepartureGroup[]>();
  for (let index = 0; index < stopCount; index += 1) {
    const stopId = reader.u32();
    const groupCount = reader.u16();
    const groups: DepartureGroup[] = [];
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const line = reader.u16();
      const direction = reader.u16();
      const service = reader.u16();
      const count = reader.u16();
      const minutes: number[] = [];
      if (count > 0) {
        let minute = reader.u16();
        minutes.push(minute);
        for (let time = 1; time < count; time += 1) {
          const mark = reader.u8();
          minute = mark === 0 ? reader.u16() : minute + mark;
          minutes.push(minute);
        }
      }
      groups.push({ line, direction, service, minutes });
    }
    byStop.set(stopId, groups);
  }
  return { lines, names, directions, services, byStop };
}

function dateKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function runs(service: TimetableService, day: Date): boolean {
  const key = dateKey(day);
  if (service.remove.includes(key)) {
    return false;
  }
  if (service.add.includes(key)) {
    return true;
  }
  if (key < service.start || key > service.end) {
    return false;
  }
  return (service.days & (1 << day.getDay())) !== 0;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Passages des 20 prochaines heures, hier et aujourd'hui, sans relire le zip. */
export function departuresFromTimetable(
  table: PreparedTimetable,
  stopIds: number[],
  now: Date,
  horizonMs = 20 * 60 * 60 * 1000,
  maxPerDirection = 8,
): ClockDeparture[] {
  const from = now.getTime();
  const until = from + horizonMs;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const days = [yesterday, today];
  const buckets = new Map<string, ClockDeparture[]>();

  for (const stopId of stopIds) {
    for (const group of table.byStop.get(stopId) ?? []) {
      const service = table.services[group.service];
      const line = table.lines[group.line];
      const direction = table.directions[group.direction];
      if (!service || !line || !direction) {
        continue;
      }
      const key = `${stopId}\0${line}\0${direction}`;
      const bucket = buckets.get(key) ?? [];
      for (const day of days) {
        if (!runs(service, day)) {
          continue;
        }
        for (const minute of group.minutes) {
          const instant = new Date(day);
          instant.setMinutes(minute);
          const at = instant.getTime();
          if (at < from || at > until || bucket.some((item) => item.at === at)) {
            continue;
          }
          bucket.push({ line, direction, at, time: formatTime(at) });
        }
      }
      buckets.set(key, bucket);
    }
  }

  const departures: ClockDeparture[] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => left.at - right.at);
    departures.push(...bucket.slice(0, maxPerDirection));
  }
  departures.sort((left, right) => left.at - right.at);
  return departures;
}

/** Toutes les heures d'une ligne à un arrêt, pour le jour calendaire demandé. */
export function lineDayBoard(table: PreparedTimetable, stopIds: number[], line: string, day: Date): LineDayBoard[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const from = start.getTime();
  const until = end.getTime();
  const yesterday = new Date(start);
  yesterday.setDate(start.getDate() - 1);
  const buckets = new Map<string, { at: number; time: string }[]>();

  for (const stopId of stopIds) {
    for (const group of table.byStop.get(stopId) ?? []) {
      const service = table.services[group.service];
      const groupLine = table.lines[group.line];
      const direction = table.directions[group.direction];
      if (!service || groupLine !== line || !direction) {
        continue;
      }
      const bucket = buckets.get(direction) ?? [];
      for (const serviceDay of [yesterday, start]) {
        if (!runs(service, serviceDay)) {
          continue;
        }
        for (const minute of group.minutes) {
          const instant = new Date(serviceDay);
          instant.setMinutes(minute);
          const at = instant.getTime();
          if (at < from || at >= until || bucket.some((item) => item.at === at)) {
            continue;
          }
          bucket.push({ at, time: formatTime(at) });
        }
      }
      buckets.set(direction, bucket);
    }
  }

  return [...buckets.entries()]
    .map(([direction, items]) => ({
      direction,
      times: items.sort((left, right) => left.at - right.at).map((item) => item.time),
    }))
    .filter((board) => board.times.length > 0)
    .sort((left, right) => left.direction.localeCompare(right.direction, "fr"));
}
