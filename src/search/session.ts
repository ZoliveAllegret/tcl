type SearchTarget = "stops" | "lines";

let token = 0;
let target: SearchTarget | null = null;
const listeners = new Set<() => void>();

export function searchToken(): number {
  return token;
}

export function searchTarget(): SearchTarget | null {
  return target;
}

export function subscribeSearch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestNewSearch(next: SearchTarget): void {
  target = next;
  token += 1;
  for (const listener of listeners) {
    listener();
  }
}
