import type { Stop } from "@/src/types";

export function stop(partial: Partial<Stop> & Pick<Stop, "id" | "name">): Stop {
  return {
    commune: "Lyon",
    address: null,
    latitude: 45.75,
    longitude: 4.85,
    lines: ["B"],
    wheelchair: false,
    ...partial,
  };
}
