import type { VehicleMode } from "@/src/theme";
import type { LatLng, MapRegion } from "@/src/types";

export type MapStop = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  lines: string[];
  /** Couleur de la ligne principale (métro, tram) ; null pour un arrêt de bus. */
  color: string | null;
};

export type MapVehicle = {
  id: string;
  line: string;
  latitude: number;
  longitude: number;
  bearing: number | null;
  delayLabel: string | null;
  destination: string | null;
  color: string;
  mode: VehicleMode;
};

export type MapLine = {
  code: string;
  color: string;
  paths: LatLng[][];
};

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type NetworkMapProps = {
  stops: MapStop[];
  vehicles: MapVehicle[];
  lines?: MapLine[];
  userLocation: LatLng | null;
  selectedVehicleId?: string | null;
  onSelectStop: (id: number) => void;
  onSelectVehicle: (id: string) => void;
  onRegionChange: (region: MapRegion) => void;
};

export type NetworkMapHandle = {
  focusOn: (point: LatLng) => void;
  fitTo: (bounds: MapBounds) => void;
};
