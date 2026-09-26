export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseLines(service: string | null | undefined): string[] {
  if (!service) {
    return [];
  }
  const lines = new Set<string>();
  for (const part of service.split(",")) {
    const line = part.split(":")[0]?.trim();
    if (line) {
      lines.add(line);
    }
  }
  return [...lines];
}

export function formatClock(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  if (value.includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    }
  }
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

/** Durée SIRI du type PT45S ou -PT2M. */
export function formatSiriDelay(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(-)?PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) {
    return null;
  }
  const sign = match[1] ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const totalSeconds = sign * (hours * 3600 + minutes * 60 + seconds);
  if (Math.abs(totalSeconds) < 45) {
    return "à l'heure";
  }
  const roundedMinutes = Math.round(totalSeconds / 60);
  if (roundedMinutes === 0) {
    return "à l'heure";
  }
  if (roundedMinutes > 0) {
    return `+${roundedMinutes} min`;
  }
  const ahead = Math.abs(roundedMinutes);
  return ahead === 1 ? "1 min d'avance" : `${ahead} min d'avance`;
}

export function refValue(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (input && typeof input === "object" && "value" in input) {
    const value = (input as { value: unknown }).value;
    return typeof value === "string" ? value : value == null ? null : String(value);
  }
  return null;
}

export function lineFromSiriRef(value: string | null): string {
  if (!value) {
    return "?";
  }
  const match = value.match(/ActIV:Line::(.+):SYTRAL/);
  return match?.[1] ?? value;
}

export function stopIdFromSiriRef(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/:(\d+):/);
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}
