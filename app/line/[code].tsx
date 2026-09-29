import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { LineChip } from "@/components/LineChip";
import { NavBar, useNavBarInset } from "@/components/NavBar";
import { Badge, Button, EmptyState, SectionLabel, SkeletonRows } from "@/components/ui";
import { useLineDisruptions } from "@/src/hooks/useDisruptionCounts";
import { stopsOnLine } from "@/src/lines/groupLines";
import { loadPreparedLineOrder, loadPreparedTimetable } from "@/src/schedule/prepared";
import { lineDayBoard, type LineDayBoard } from "@/src/schedule/timetable";
import { getLineName, loadLineNames } from "@/src/schedule/theoretical";
import { oppositePlatforms } from "@/src/stops/siblings";
import { useStops } from "@/src/stops/StopsProvider";
import { NEUTRAL_LINE, lineColor, makeStyles, useTheme, vehicleMode } from "@/src/theme";
import type { Stop } from "@/src/types";

const MODE_LABEL = { metro: "Métro", tram: "Tramway", bus: "Bus" } as const;

export default function LineScreen() {
  const styles = useStyles();
  const t = useTheme();
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const code = decodeURIComponent(rawCode ?? "");
  const { stops } = useStops();
  const [named, setNamed] = useState(Boolean(getLineName(code)));
  const navInset = useNavBarInset();
  const [passageOrder, setPassageOrder] = useState<number[] | undefined>(undefined);
  const lineStops = useMemo(() => {
    if (passageOrder === undefined) {
      return [];
    }
    return stopsOnLine(stops, code, passageOrder);
  }, [code, passageOrder, stops]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listRef = useRef<FlatList<Stop>>(null);
  const selected = lineStops.find((stop) => stop.id === selectedId) ?? lineStops[0];
  const { disruptions, loading: disruptionsLoading } = useLineDisruptions(code);

  useEffect(() => {
    let cancelled = false;
    setPassageOrder(undefined);
    setSelectedId(null);
    void loadPreparedLineOrder()
      .then((order) => {
        if (!cancelled) {
          setPassageOrder(order[code] ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPassageOrder([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    void loadLineNames()
      .then(() => {
        if (!cancelled) {
          setNamed(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const label = named ? getLineName(code) : undefined;
  const mode = vehicleMode(code);
  const base = lineColor(code);
  const color = base === NEUTRAL_LINE ? t.colors.lineNeutral : base;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: code ? `Ligne ${code}` : "Ligne" }} />
      <FlatList
        ref={listRef}
        data={lineStops}
        extraData={selected?.id}
        keyExtractor={(stop) => String(stop.id)}
        contentContainerStyle={[styles.list, { paddingBottom: navInset }]}
        ListHeaderComponent={
          <View>
            <View style={[styles.hero, t.elevation]}>
              <View style={[styles.band, { backgroundColor: color }]} />
              <View style={styles.heroChip}>
                <LineChip line={code} size="lg" />
              </View>
              <Text style={styles.name}>{label ?? `Ligne ${code}`}</Text>
              <View style={styles.badges}>
                <Badge icon={mode}>{MODE_LABEL[mode]}</Badge>
                <Badge>
                  {lineStops.length} {lineStops.length > 1 ? "arrêts" : "arrêt"}
                </Badge>
              </View>
              <Button
                icon="map"
                label="Voir le tracé"
                onPress={() => router.push({ pathname: "/map", params: { trace: code } })}
              />
              {disruptionsLoading ? (
                <Text style={styles.disruptionPending}>Chargement des perturbations…</Text>
              ) : disruptions.length > 0 ? (
                <View style={styles.disruptions}>
                  <Text style={styles.disruptionTitle}>
                    {disruptions.length > 1
                      ? `${disruptions.length} perturbations`
                      : "1 perturbation"}
                  </Text>
                  {disruptions.map((disruption) => (
                    <View key={disruption.id} style={styles.disruption}>
                      <Text style={styles.disruptionMessage}>{disruption.message}</Text>
                      {disruption.until ? (
                        <Text style={styles.disruptionUntil}>Jusqu'au {disruption.until}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <LineSchedule code={code} stop={selected} stops={stops} />
            {passageOrder === undefined ? (
              <View style={styles.pending}>
                <Text style={styles.hint}>Chargement de la ligne…</Text>
                <SkeletonRows count={3} />
              </View>
            ) : lineStops.length > 0 ? (
              <SectionLabel>Arrêts · ordre de passage</SectionLabel>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="empty" title="Aucun arrêt pour cette ligne" />}
        renderItem={({ item, index }) => (
          <LineStopRow
            stop={item}
            code={code}
            color={color}
            first={index === 0}
            last={index === lineStops.length - 1}
            selected={item.id === selected?.id}
            onSelect={() => {
              setSelectedId(item.id);
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
          />
        )}
      />
      <NavBar />
    </View>
  );
}

function LineSchedule({ code, stop, stops }: { code: string; stop: Stop | undefined; stops: Stop[] }) {
  const styles = useStyles();
  const [board, setBoard] = useState<LineDayBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const platformKey = stop ? [stop.id, ...oppositePlatforms(stop, stops).map((platform) => platform.id)].join(",") : "";

  useEffect(() => {
    if (!stop) {
      return;
    }
    let cancelled = false;
    const stopIds = platformKey.split(",").map(Number);
    setBoard(null);
    setError(null);
    void loadPreparedTimetable()
      .then((table) => {
        if (!cancelled) {
          setBoard(lineDayBoard(table, stopIds, code, new Date()));
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Horaires indisponibles.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, platformKey, stop]);

  if (!stop) {
    return null;
  }
  const nowLabel = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <View>
      <SectionLabel trailing={<Text style={styles.hint}>aujourd'hui</Text>}>Horaires</SectionLabel>
      <Text style={styles.scheduleStop} numberOfLines={1}>
        {stop.name}
      </Text>
      {board === null && !error ? <Text style={styles.hint}>Chargement des horaires…</Text> : null}
      {error ? <Text style={styles.hint}>{error}</Text> : null}
      {board && board.length === 0 ? <Text style={styles.hint}>Aucun passage aujourd'hui à cet arrêt.</Text> : null}
      {board?.map((group) => {
        const nextIndex = group.times.findIndex((time) => time >= nowLabel);
        return (
          <View key={group.direction} style={styles.scheduleCard}>
            <Text style={styles.scheduleDirection} numberOfLines={2}>
              vers {group.direction}
            </Text>
            <View style={styles.times}>
              {group.times.map((time, index) => (
                <Text key={`${group.direction}-${time}`} style={[styles.time, index === nextIndex && styles.timeNext]}>
                  {time}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LineStopRow({
  stop,
  code,
  color,
  first,
  last,
  selected,
  onSelect,
}: {
  stop: Stop;
  code: string;
  color: string;
  first: boolean;
  last: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const styles = useStyles();
  const t = useTheme();
  const connections = stop.lines.filter((line) => line !== code).slice(0, 6);
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.stop,
        first && styles.stopFirst,
        last && styles.stopLast,
        selected && styles.stopSelected,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${stop.name}, ${stop.commune}`}
    >
      <View style={[styles.dot, { borderColor: color }, selected && { backgroundColor: color }]} />
      <View style={[styles.stopBody, !last && styles.divider]}>
        <View style={styles.stopCopy}>
          <Text style={styles.stopName} numberOfLines={1}>
            {stop.name}
          </Text>
          <Text style={styles.stopMeta} numberOfLines={1}>
            {stop.commune}
          </Text>
          {connections.length > 0 ? (
            <View style={styles.connections}>
              {connections.map((line) => (
                <LineChip key={line} line={line} size="sm" />
              ))}
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: "/stop/[id]", params: { id: String(stop.id) } })}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${stop.name}`}
        >
          <Icon name="chevron" color={t.colors.muted} size={18} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  list: {
    padding: t.space.lg,
    paddingTop: t.space.sm,
  },
  hero: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.xl,
    padding: t.space.xl,
    paddingTop: t.space.xl + 6,
    gap: t.space.md,
    overflow: "hidden",
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  heroChip: {
    alignSelf: "flex-start",
  },
  name: {
    ...t.type.title,
    color: t.colors.ink,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space.sm,
  },
  disruptionPending: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  disruptions: {
    gap: t.space.sm,
  },
  disruptionTitle: {
    ...t.type.callout,
    fontWeight: "800",
    color: t.colors.danger,
  },
  disruption: {
    backgroundColor: t.colors.dangerSoft,
    borderRadius: t.radius.md,
    padding: t.space.md,
    gap: 4,
  },
  disruptionMessage: {
    ...t.type.callout,
    color: t.colors.ink,
  },
  disruptionUntil: {
    ...t.type.caption,
    color: t.colors.danger,
    fontWeight: "700",
  },
  hint: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  pending: {
    gap: t.space.sm,
  },
  scheduleStop: {
    ...t.type.bodyStrong,
    color: t.colors.ink,
    marginBottom: t.space.sm,
  },
  scheduleCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.space.lg,
    gap: t.space.md,
    marginBottom: t.space.sm,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  scheduleDirection: {
    ...t.type.callout,
    fontWeight: "800",
    color: t.colors.ink,
  },
  times: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  time: {
    ...t.type.time,
    color: t.colors.ink,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.sm,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  timeNext: {
    backgroundColor: t.colors.accent,
    color: t.colors.accentInk,
  },
  stopSelected: {
    backgroundColor: t.colors.surfaceMuted,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
    backgroundColor: t.colors.surface,
    paddingLeft: t.space.lg,
    borderLeftWidth: t.scheme === "dark" ? 1 : 0,
    borderRightWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  stopFirst: {
    borderTopLeftRadius: t.radius.lg,
    borderTopRightRadius: t.radius.lg,
    borderTopWidth: t.scheme === "dark" ? 1 : 0,
  },
  stopLast: {
    borderBottomLeftRadius: t.radius.lg,
    borderBottomRightRadius: t.radius.lg,
    borderBottomWidth: t.scheme === "dark" ? 1 : 0,
  },
  pressed: {
    backgroundColor: t.colors.surfacePressed,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: t.colors.surface,
  },
  stopBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    paddingVertical: t.space.md,
    paddingRight: t.space.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  stopCopy: {
    flex: 1,
    gap: 2,
  },
  stopName: {
    ...t.type.bodyStrong,
    fontSize: 15,
    color: t.colors.ink,
  },
  stopMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  connections: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
}));
