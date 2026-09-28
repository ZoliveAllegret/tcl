import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { LineChip } from "@/components/LineChip";
import { useNavBarInset } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { EmptyState, ProgressMeter, ScreenHeader, SearchField, SkeletonRows } from "@/components/ui";
import { formatClock, normalizeText } from "@/src/format";
import { distanceMeters } from "@/src/geo";
import { planTrips, type Trip, type TripLeg, type TripProgress } from "@/src/schedule/planner";
import { useStops } from "@/src/stops/StopsProvider";
import { makeStyles, useTheme } from "@/src/theme";
import type { Stop } from "@/src/types";

const SAME_PLACE_METERS = 400;

/** Une suggestion par lieu : quais et modes regroupés s'ils portent le même nom. */
function stationChoices(stops: Stop[]): Stop[] {
  const buckets = new Map<string, Stop[]>();
  for (const stop of stops) {
    const key = `${normalizeText(stop.name)}\0${stop.commune}`;
    const list = buckets.get(key) ?? [];
    list.push(stop);
    buckets.set(key, list);
  }
  const stations: Stop[] = [];
  for (const bucket of buckets.values()) {
    const pending = [...bucket];
    while (pending.length > 0) {
      const seed = pending.shift();
      if (!seed) {
        break;
      }
      const cluster = [seed];
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (distanceMeters(seed, pending[index]) <= SAME_PLACE_METERS) {
          const [other] = pending.splice(index, 1);
          cluster.push(other);
        }
      }
      const lines = [...new Set(cluster.flatMap((stop) => stop.lines))];
      stations.push({ ...seed, lines });
    }
  }
  return stations.sort((left, right) => left.name.localeCompare(right.name, "fr") || left.id - right.id);
}

export default function TripScreen() {
  const styles = useStyles();
  const t = useTheme();
  const { stops } = useStops();
  const navInset = useNavBarInset();
  const stations = useMemo(() => stationChoices(stops), [stops]);
  const names = useMemo(() => new Map(stops.map((stop) => [stop.id, stop.name])), [stops]);
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStop, setFromStop] = useState<Stop | null>(null);
  const [toStop, setToStop] = useState<Stop | null>(null);
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<TripProgress>({ label: "Calcul du trajet", percent: 0 });
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const query = normalizeText(activeField === "from" ? fromQuery : activeField === "to" ? toQuery : "");
    const selected = activeField === "from" ? fromStop : toStop;
    if (query.length < 2 || (selected && normalizeText(selected.name) === query)) {
      return [];
    }
    const prefix: Stop[] = [];
    const contains: Stop[] = [];
    for (const stop of stations) {
      const name = normalizeText(stop.name);
      const commune = normalizeText(stop.commune);
      if (name.startsWith(query)) {
        prefix.push(stop);
      } else if (name.includes(query) || commune.includes(query)) {
        contains.push(stop);
      }
      if (prefix.length + contains.length >= 8 && prefix.length >= 8) {
        break;
      }
    }
    return [...prefix, ...contains].slice(0, 8);
  }, [activeField, fromQuery, fromStop, stations, toQuery, toStop]);

  useEffect(() => {
    if (!fromStop || !toStop || fromStop.id === toStop.id) {
      setTrips([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProgress({ label: "Calcul du trajet", percent: 0 });
    void planTrips(fromStop.id, toStop.id, new Date(), stops, setProgress)
      .then((next) => {
        if (!cancelled) {
          setTrips(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrips([]);
          setError("Le calcul du trajet a échoué.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromStop, stops, toStop]);

  function choose(stop: Stop) {
    if (activeField === "to") {
      setToStop(stop);
      setToQuery(stop.name);
    } else {
      setFromStop(stop);
      setFromQuery(stop.name);
    }
    setActiveField(null);
  }

  function swap() {
    setFromStop(toStop);
    setToStop(fromStop);
    setFromQuery(toQuery);
    setToQuery(fromQuery);
  }

  const sameStation =
    fromStop != null && toStop != null && normalizeText(fromStop.name) === normalizeText(toStop.name) && fromStop.commune === toStop.commune;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: navInset }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <ScreenHeader title="Trajet" subtitle="Départ, arrivée et horaires">
        <View style={styles.fields}>
          <SearchField
            icon="place"
            value={fromQuery}
            onChangeText={(value) => {
              setFromQuery(value);
              setFromStop(null);
              setActiveField("from");
            }}
            onFocus={() => setActiveField("from")}
            placeholder="Départ"
            autoCapitalize="words"
          />
          <Pressable
            onPress={swap}
            style={styles.swap}
            accessibilityRole="button"
            accessibilityLabel="Inverser le départ et l'arrivée"
          >
            <Icon name="swap" color={t.colors.ink} size={18} />
          </Pressable>
          <SearchField
            icon="place"
            value={toQuery}
            onChangeText={(value) => {
              setToQuery(value);
              setToStop(null);
              setActiveField("to");
            }}
            onFocus={() => setActiveField("to")}
            placeholder="Arrivée"
            autoCapitalize="words"
          />
        </View>
      </ScreenHeader>

      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((stop) => (
            <Pressable
              key={stop.id}
              onPress={() => choose(stop)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${stop.name}, ${stop.commune}`}
            >
              <Text style={styles.suggestionName}>{stop.name}</Text>
              <Text style={styles.suggestionMeta}>{stop.commune}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.inset}>
          <ProgressMeter label={progress.label} percent={progress.percent} />
          <SkeletonRows count={2} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.inset}>
          <EmptyState tone="danger" icon="offline" title="Trajet indisponible" message={error} />
        </View>
      ) : null}

      {!loading && !error && sameStation ? (
        <View style={styles.inset}>
          <EmptyState icon="place" title="Même arrêt" message="Choisissez une arrivée différente du départ." />
        </View>
      ) : null}

      {!loading && !error && fromStop && toStop && !sameStation && trips.length === 0 ? (
        <View style={styles.inset}>
          <EmptyState
            icon="trip"
            title="Aucun trajet"
            message="Aucun itinéraire trouvé, même avec plusieurs correspondances."
          />
        </View>
      ) : null}

      <View style={styles.results}>
        {trips.map((trip) => (
          <View key={tripKey(trip)} style={[styles.card, t.elevation]}>
            <View style={styles.cardHead}>
              <Text style={styles.duration}>{formatDuration(trip.departureAt, trip.arrivalAt)}</Text>
              <Text style={styles.when}>
                {formatClock(trip.departureAt)} – {formatClock(trip.arrivalAt)}
              </Text>
            </View>
            <Text style={styles.summary}>
              {transferLabel(trip.legs.length)}
              {trip.provisional ? " · horaire estimé" : ""}
            </Text>
            {trip.legs.map((leg, index) => (
              <View key={`${leg.line}-${leg.fromStopId}-${leg.toStopId}`} style={styles.leg}>
                <LineChip line={leg.line} />
                <View style={styles.legCopy}>
                  <Text style={styles.legTitle}>
                    {names.get(leg.fromStopId) ?? "Arrêt"} → {names.get(leg.toStopId) ?? "Arrêt"}
                  </Text>
                  <Text style={styles.legMeta}>
                    vers {leg.direction} · {formatClock(leg.departureAt)} – {formatClock(leg.arrivalAt)}
                  </Text>
                </View>
                {index < trip.legs.length - 1 ? (
                  <Text style={styles.transfer}>{waitLabel(trip.legs[index], trip.legs[index + 1])}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function waitLabel(current: TripLeg, next: TripLeg): string {
  const minutes = Math.round((Date.parse(next.departureAt) - Date.parse(current.arrivalAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "correspondance";
  }
  return `${minutes} min`;
}

function tripKey(trip: Trip): string {
  return trip.legs.map((leg) => `${leg.line}-${leg.fromStopId}-${leg.toStopId}-${leg.departureAt}`).join("|");
}

function transferLabel(legs: number): string {
  if (legs <= 1) {
    return "Direct";
  }
  const transfers = legs - 1;
  return transfers > 1 ? `${transfers} correspondances` : "1 correspondance";
}

function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    paddingBottom: t.space.xl,
  },
  fields: {
    gap: t.space.sm,
  },
  swap: {
    alignSelf: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.surface,
  },
  suggestions: {
    marginHorizontal: t.space.lg,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    overflow: "hidden",
  },
  suggestion: {
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    gap: 2,
  },
  pressed: {
    backgroundColor: t.colors.surfaceMuted,
  },
  suggestionName: {
    ...t.type.bodyStrong,
    color: t.colors.ink,
  },
  suggestionMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  inset: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
  },
  hint: {
    ...t.type.caption,
    color: t.colors.muted,
    marginBottom: t.space.sm,
  },
  results: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
    gap: t.space.md,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.xl,
    padding: t.space.lg,
    gap: t.space.sm,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: t.space.sm,
  },
  duration: {
    ...t.type.title,
    color: t.colors.ink,
  },
  when: {
    ...t.type.callout,
    color: t.colors.ink,
    fontWeight: "700",
  },
  summary: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  leg: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
  },
  legCopy: {
    flex: 1,
    gap: 2,
  },
  legTitle: {
    ...t.type.callout,
    color: t.colors.ink,
    fontWeight: "700",
  },
  legMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  transfer: {
    ...t.type.caption,
    color: t.colors.muted,
  },
}));
