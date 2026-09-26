export type Stop = {
  id: number;
  name: string;
  commune: string;
  address: string | null;
  latitude: number;
  longitude: number;
  lines: string[];
  wheelchair: boolean;
};

export type PassageKind = "estimated" | "theoretical";

export type Passage = {
  stopId: number;
  line: string;
  direction: string;
  delayLabel: string;
  scheduledAt: string;
  kind: PassageKind;
  destinationStopId: number | null;
};

export type Vehicle = {
  id: string;
  line: string;
  latitude: number;
  longitude: number;
  bearing: number | null;
  delayLabel: string | null;
  destinationStopId: number | null;
  recordedAt: string | null;
};

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type MapRegion = LatLng & {
  latitudeDelta: number;
  longitudeDelta: number;
};
