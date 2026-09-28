import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { LineChip } from "@/components/LineChip";
import { NavBar, useNavBarInset } from "@/components/NavBar";
import { Badge, EmptyState, IconButton, LiveDot, SectionLabel, SkeletonRows } from "@/components/ui";
import { fetchPassages } from "@/src/api/grandLyon";
import { useFavorites } from "@/src/favorites/FavoritesProvider";
import { formatClock } from "@/src/format";
import { getLineName, loadNextDepartures, type ScheduledDeparture } from "@/src/schedule/theoretical";
import { usePlaceName } from "@/src/stops/placeName";
import { oppositePlatforms } from "@/src/stops/siblings";
import { useStops } from "@/src/stops/StopsProvider";
import { makeStyles, useTheme } from "@/src/theme";
import type { Passage } from "@/src/types";

const REFRESH_MS = 10_000;

/** Évite de relancer le fichier d'horaires si Safari recharge la page en boucle. */
function allowScheduleRead(stopId: number): boolean {
  if (typeof sessionStorage === "undefined") {
    return true;
  }
  try {
    const key = "tcl-next-departure";
    const now = Date.now();
    const previous = JSON.parse(sessionStorage.getItem(key) || "null") as { id: number; at: number; n: number } | null;
    const n = previous && previous.id === stopId && now - previous.at < 12000 ? previous.n + 1 : 1;
    sessionStorage.setItem(key, JSON.stringify({ id: stopId, at: now, n }));
    return n <= 2;
  } catch {
    return true;
  }
}

function countdownUntil(at: number): string {
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

function asTheoretical(stopId: number, item: ScheduledDeparture): Passage {
  return {
    stopId,
    line: item.line,
    direction: item.direction,
    delayLabel: countdownUntil(item.at),
    scheduledAt: new Date(item.at).toISOString(),
    kind: "theoretical",
    destinationStopId: null,
  };
}

/** « 3 min » devient { value: "3", unit: "min" } pour l'afficher en grand. */
function splitCountdown(label: string): { value: string; unit: string | null } {
  const match = label.trim().match(/^(\d+)\s*(min|mn|minutes?)\b/i);
  if (match) {
    return { value: match[1], unit: "min" };
  }
  return { value: label.trim() || "—", unit: null };
}

export default function StopScreen() {
  const styles = useStyles();
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stopId = Number(id);
  const { getStop, stops } = useStops();
  const { isFavorite, toggle } = useFavorites();
  const stop = Number.isFinite(stopId) ? getStop(stopId) : undefined;
  const placeName = usePlaceName(stop);
  const platformIds = useMemo(() => {
    if (!Number.isFinite(stopId)) {
      return [];
    }
    if (!stop) {
      return [stopId];
    }
    return [stop.id, ...oppositePlatforms(stop, stops).map((platform) => platform.id)];
  }, [stop, stopId, stops]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduledDeparture[] | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState("Recherche du prochain départ…");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const navInset = useNavBarInset();

  useEffect(() => {
    setLoading(true);
    setPassages([]);
    setError(null);
    setSchedule(null);
    setScheduleError(null);
    setScheduleStatus("Recherche du prochain départ…");
  }, [stopId]);

  const waitingForLive = loading || error !== null || passages.length > 0;

  useEffect(() => {
    if (!Number.isFinite(stopId) || waitingForLive || stops.length === 0) {
      return;
    }
    if (!allowScheduleRead(stopId)) {
      setSchedule([]);
      return;
    }
    let cancelled = false;
    loadNextDepartures(platformIds, (message) => {
      if (!cancelled) {
        setScheduleStatus(message);
      }
    })
      .then((departures) => {
        if (!cancelled) {
          setSchedule(departures);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setScheduleError(cause instanceof Error ? cause.message : "Horaires indisponibles.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [platformIds, stopId, stops.length, waitingForLive]);

  const load = useCallback(
    async (manual: boolean) => {
      const request = ++requestRef.current;
      if (!Number.isFinite(stopId)) {
        setError("Arrêt inconnu.");
        setLoading(false);
        return;
      }
      if (manual) {
        setRefreshing(true);
      }
      try {
        const groups = await Promise.all(platformIds.map((platformId) => fetchPassages(platformId)));
        const next = groups.flat().sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
        if (request !== requestRef.current) {
          return;
        }
        setPassages(next);
        setError(null);
      } catch (cause) {
        if (request !== requestRef.current) {
          return;
        }
        setError(cause instanceof Error ? cause.message : "Passages indisponibles.");
      } finally {
        if (request === requestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [platformIds, stopId],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
      const timer = setInterval(() => {
        void load(false);
      }, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const shown = passages.length > 0 ? passages : (schedule ?? []).map((item) => asTheoretical(stopId, item));
  const groups = new Map<string, Passage[]>();
  for (const passage of shown) {
    const current = groups.get(passage.line) ?? [];
    current.push(passage);
    groups.set(passage.line, current);
  }

  const favorite = Number.isFinite(stopId) && isFavorite(stopId);
  const liveCount = passages.filter((passage) => passage.kind === "estimated").length;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () =>
            Number.isFinite(stopId) ? (
              <IconButton
                icon={favorite ? "starFilled" : "star"}
                label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                active={favorite}
                size={38}
                onPress={() => void toggle(stopId)}
              />
            ) : null,
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: navInset }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={t.colors.accent} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{placeName || stop?.commune || "Arrêt TCL"}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {stop?.name ?? "Arrêt"}
          </Text>
          {stop?.address ? <Text style={styles.address}>{stop.address}</Text> : null}
          {stop ? (
            <View style={styles.heroLines}>
              {stop.lines.map((line) => (
                <LineChip key={line} line={line} />
              ))}
              {stop.wheelchair ? <Badge icon="accessible">Accessible PMR</Badge> : null}
            </View>
          ) : null}
        </View>

        <SectionLabel
          trailing={
            passages.length > 0 ? (
              <View style={styles.liveTag}>
                <LiveDot size={7} />
                <Text style={styles.liveTagLabel}>{liveCount > 0 ? "En direct" : "Prévisions"}</Text>
              </View>
            ) : shown.length > 0 ? (
              <Text style={styles.hint}>Théorique · 2 sens</Text>
            ) : null
          }
        >
          Prochains départs
        </SectionLabel>

        {loading ? <SkeletonRows count={2} /> : null}
        {error ? (
          <EmptyState tone="danger" icon="offline" title="Passages indisponibles" message={error} />
        ) : null}
        {!loading && !error && passages.length === 0 && schedule === null && !scheduleError ? (
          <View style={styles.pending}>
            <Text style={styles.hint}>{scheduleStatus}</Text>
            <SkeletonRows count={1} />
          </View>
        ) : null}
        {scheduleError && passages.length === 0 ? (
          <EmptyState tone="danger" icon="offline" title="Horaires indisponibles" message={scheduleError} />
        ) : null}
        {!loading && !error && passages.length === 0 && schedule && schedule.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Aucun passage annoncé"
            message="Pas de départ en temps réel, ni de prochain horaire théorique."
          />
        ) : null}

        {[...groups.entries()].map(([line, items]) => (
          <View key={line} style={[styles.card, t.elevation]}>
            <View style={styles.cardHead}>
              <LineChip line={line} />
              <Text style={styles.cardTitle} numberOfLines={1}>
                {getLineName(line) ?? `Ligne ${line}`}
              </Text>
            </View>
            {items.map((passage, index) => {
              const live = passage.kind === "estimated";
              const countdown = splitCountdown(passage.delayLabel);
              return (
                <View
                  key={`${passage.line}-${passage.direction}-${passage.scheduledAt}`}
                  style={[styles.departure, index > 0 && styles.departureDivider]}
                >
                  <View style={styles.departureCopy}>
                    <Text style={styles.direction} numberOfLines={2}>
                      {passage.direction}
                    </Text>
                    <View style={styles.kindRow}>
                      <View style={[styles.kindDot, { backgroundColor: live ? t.colors.live : t.colors.scheduled }]} />
                      <Text style={[styles.kind, { color: live ? t.colors.live : t.colors.scheduled }]}>
                        {live ? "Temps réel" : "Théorique"}
                        {passage.scheduledAt ? ` · ${formatClock(passage.scheduledAt)}` : ""}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.countdown,
                      { backgroundColor: live ? t.colors.liveSoft : t.colors.surfaceMuted },
                    ]}
                    accessibilityLabel={`Départ ${passage.delayLabel}`}
                  >
                    <Text
                      style={[
                        countdown.unit ? styles.countdownValue : styles.countdownWord,
                        { color: live ? t.colors.live : t.colors.ink },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {countdown.value}
                    </Text>
                    {countdown.unit ? (
                      <Text style={[styles.countdownUnit, { color: live ? t.colors.live : t.colors.muted }]}>
                        {countdown.unit}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

      </ScrollView>
      <NavBar />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.xs,
  },
  hero: {
    gap: t.space.xs + 2,
    paddingBottom: t.space.sm,
  },
  eyebrow: {
    ...t.type.overline,
    color: t.colors.accent,
  },
  title: {
    ...t.type.display,
    color: t.colors.ink,
  },
  address: {
    ...t.type.callout,
    color: t.colors.muted,
  },
  heroLines: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: t.space.sm,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  liveTagLabel: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.live,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.space.lg,
    gap: t.space.md,
    marginBottom: t.space.md,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
  },
  cardTitle: {
    ...t.type.bodyStrong,
    fontSize: 15,
    color: t.colors.ink,
    flexShrink: 1,
  },
  departure: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
  },
  departureDivider: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: t.space.md,
  },
  departureCopy: {
    flex: 1,
    gap: t.space.xs,
  },
  direction: {
    ...t.type.headline,
    fontSize: 17,
    color: t.colors.ink,
  },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kind: {
    ...t.type.caption,
    fontWeight: "600",
  },
  countdown: {
    minWidth: 68,
    height: 64,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownValue: {
    ...t.type.numeral,
  },
  countdownWord: {
    fontSize: 15,
    fontWeight: "800",
  },
  countdownUnit: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: -1,
  },
  pending: {
    gap: t.space.sm,
  },
  hint: {
    ...t.type.caption,
    color: t.colors.muted,
  },
}));
