import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { LineChip } from "@/components/LineChip";
import { NavBar, useNavBarInset } from "@/components/NavBar";
import { Badge, Button, EmptyState, SectionLabel, SkeletonRows } from "@/components/ui";
import { useLineDisruptions } from "@/src/hooks/useDisruptionCounts";
import { finalizePassageOrder, partitionStopsOnLine, stopsOnLine } from "@/src/lines/groupLines";
import {
  loadPreparedLineOrder,
  loadPreparedLineOrderDirections,
  loadPreparedTimetable,
} from "@/src/schedule/prepared";
import {
  lineDayBoard,
  lineDirectionStopBoards,
  type LineDayBoard,
  type LineDirectionStopBoard,
} from "@/src/schedule/timetable";
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
  const [passageByDirection, setPassageByDirection] = useState<
    Record<string, Record<string, number[]>> | undefined
  >(undefined);
  const [lightboxStop, setLightboxStop] = useState<Stop | null>(null);
  const [expandedPassageDirs, setExpandedPassageDirs] = useState<Set<string>>(() => new Set());
  const orderReady = passageOrder !== undefined && passageByDirection !== undefined;
  const stopNameById = useMemo(() => new Map(stops.map((stop) => [stop.id, stop.name])), [stops]);
  const directionSections = useMemo(() => {
    const byDir = passageByDirection?.[code];
    if (!byDir) {
      return [];
    }
    return Object.entries(byDir)
      .sort(([left], [right]) => left.localeCompare(right, "fr"))
      .map(([headsign, rawOrder]) => ({
        headsign,
        stops: stopsOnLine(
          stops,
          code,
          finalizePassageOrder(rawOrder, headsign, stopNameById),
        ),
      }))
      .filter((section) => section.stops.length > 0);
  }, [code, passageByDirection, stopNameById, stops]);
  const { extraStops } = useMemo(() => {
    if (!orderReady) {
      return { extraStops: [] as Stop[] };
    }
    const union = [
      ...new Set([
        ...(passageOrder ?? []),
        ...Object.values(passageByDirection?.[code] ?? {}).flat(),
      ]),
    ];
    return partitionStopsOnLine(stops, code, union.length > 0 ? union : passageOrder);
  }, [code, orderReady, passageByDirection, passageOrder, stops]);
  const lineStops = useMemo(() => {
  const seen = new Set<number>();
    const merged: Stop[] = [];
    for (const section of directionSections) {
      for (const stop of section.stops) {
        if (!seen.has(stop.id)) {
          seen.add(stop.id);
          merged.push(stop);
        }
      }
    }
    for (const stop of extraStops) {
      if (!seen.has(stop.id)) {
        seen.add(stop.id);
        merged.push(stop);
      }
    }
    if (merged.length === 0 && orderReady) {
      return partitionStopsOnLine(stops, code, passageOrder).mainStops.concat(
        partitionStopsOnLine(stops, code, passageOrder).extraStops,
      );
    }
    return merged;
  }, [code, directionSections, extraStops, orderReady, passageOrder, stops]);
  const { disruptions, loading: disruptionsLoading } = useLineDisruptions(code);

  useEffect(() => {
    let cancelled = false;
    setPassageOrder(undefined);
    setPassageByDirection(undefined);
    setLightboxStop(null);
    setExpandedPassageDirs(new Set());
    void Promise.all([loadPreparedLineOrder(), loadPreparedLineOrderDirections()])
      .then(([order, byDirection]) => {
        if (!cancelled) {
          setPassageOrder(order[code] ?? []);
          setPassageByDirection(byDirection);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPassageOrder([]);
          setPassageByDirection({});
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
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: navInset }]}>
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
                {disruptions.length > 1 ? `${disruptions.length} perturbations` : "1 perturbation"}
              </Text>
              {disruptions.map((disruption) => (
                <View key={disruption.id} style={styles.disruption}>
                  <Text style={styles.disruptionMessage}>{disruption.message}</Text>
                  {disruption.until ? <Text style={styles.disruptionUntil}>Jusqu'au {disruption.until}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {!orderReady && stops.length === 0 ? (
          <View style={styles.pending}>
            <Text style={styles.hint}>Chargement de la ligne…</Text>
            <SkeletonRows count={3} />
          </View>
        ) : null}
        {orderReady && lineStops.length === 0 ? <EmptyState icon="empty" title="Aucun arrêt pour cette ligne" /> : null}
        {directionSections.map((section) => (
          <LinePassageStopsPanel
            key={section.headsign}
            title={`Vers ${section.headsign}`}
            meta={`${section.stops.length} arrêt${section.stops.length > 1 ? "s" : ""} · du départ à l'arrivée`}
            hint="Appuyez sur un arrêt pour voir les horaires du jour."
            color={color}
            code={code}
            stops={section.stops}
            open={expandedPassageDirs.has(section.headsign)}
            onToggle={() => {
              setExpandedPassageDirs((prev) => {
                const next = new Set(prev);
                if (next.has(section.headsign)) {
                  next.delete(section.headsign);
                } else {
                  next.add(section.headsign);
                }
                return next;
              });
            }}
            onStopPress={setLightboxStop}
          />
        ))}
        {extraStops.length > 0 ? (
          <LinePassageStopsPanel
            title="Autres arrêts sur la ligne"
            meta={`${extraStops.length} arrêt${extraStops.length > 1 ? "s" : ""} · embranchements, terminus courts…`}
            color={color}
            code={code}
            stops={extraStops}
            open={expandedPassageDirs.has("__extra__")}
            onToggle={() => {
              setExpandedPassageDirs((prev) => {
                const next = new Set(prev);
                if (next.has("__extra__")) {
                  next.delete("__extra__");
                } else {
                  next.add("__extra__");
                }
                return next;
              });
            }}
            onStopPress={setLightboxStop}
          />
        ) : null}
        {lineStops.length > 0 ? (
          <LineDayTimetableSection code={code} color={color} lineStops={lineStops} stops={stops} />
        ) : null}
      </ScrollView>
      <StopScheduleLightbox
        visible={lightboxStop != null}
        stop={lightboxStop}
        code={code}
        color={color}
        stops={stops}
        onClose={() => setLightboxStop(null)}
        onOpenStop={(stopId) => {
          setLightboxStop(null);
          router.push({ pathname: "/stop/[id]", params: { id: String(stopId) } });
        }}
      />
      <NavBar />
    </View>
  );
}

const TIME_CELL_WIDTH = 54;

function LinePassageStopsPanel({
  title,
  meta,
  hint,
  color,
  code,
  stops,
  open,
  onToggle,
  onStopPress,
}: {
  title: string;
  meta: string;
  hint?: string;
  color: string;
  code: string;
  stops: Stop[];
  open: boolean;
  onToggle: () => void;
  onStopPress: (stop: Stop) => void;
}) {
  const grid = useGridStyles();
  const t = useTheme();

  return (
    <View style={grid.gridBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [grid.directionHead, { borderLeftColor: color }, t.elevation, pressed && grid.pressedHead]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <View style={grid.directionCopy}>
          <Text style={grid.directionTitle}>{title}</Text>
          <Text style={grid.directionMeta}>{meta}</Text>
        </View>
        <Icon name="chevron" color={t.colors.muted} size={20} style={open ? grid.chevronOpen : undefined} />
      </Pressable>
      {open ? (
        <View style={[grid.directionBody, t.elevation]}>
          {hint ? <Text style={[grid.hint, { paddingHorizontal: t.space.md, paddingTop: t.space.sm }]}>{hint}</Text> : null}
          {stops.map((stop, index) => (
            <LineStopRow
              key={stop.id}
              stop={stop}
              code={code}
              color={color}
              first={index === 0}
              last={index === stops.length - 1}
              onPress={() => onStopPress(stop)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function stopScheduleKey(direction: string, stopId: number): string {
  return `${direction}:${stopId}`;
}

function nextDepartureLabel(times: string[], nowLabel: string): string | null {
  if (times.length === 0) {
    return null;
  }
  return times.find((time) => time >= nowLabel) ?? times[times.length - 1] ?? null;
}

function LineDayTimetableSection({
  code,
  color,
  lineStops,
  stops,
}: {
  code: string;
  color: string;
  lineStops: Stop[];
  stops: Stop[];
}) {
  const styles = useGridStyles();
  const t = useTheme();
  const [grids, setGrids] = useState<LineDirectionStopBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirections, setExpandedDirections] = useState<Set<string>>(() => new Set());
  const [expandedStops, setExpandedStops] = useState<Set<string>>(() => new Set());
  const stopNames = useMemo(() => new Map(lineStops.map((stop) => [stop.id, stop.name])), [lineStops]);
  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    [grids],
  );

  useEffect(() => {
    let cancelled = false;
    setGrids(null);
    setError(null);
    setExpandedDirections(new Set());
    setExpandedStops(new Set());
    const platformIds = (stop: Stop) => [stop.id, ...oppositePlatforms(stop, stops).map((platform) => platform.id)];
    void loadPreparedTimetable()
      .then((table) => {
        if (cancelled) {
          return;
        }
        const day = new Date();
        setGrids(
          lineDirectionStopBoards(table, lineStops, (stopId) => {
            const stop = lineStops.find((item) => item.id === stopId);
            return stop ? platformIds(stop) : [stopId];
          }, code, day),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Horaires indisponibles.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, lineStops, stops]);

  if (error) {
    return (
      <View style={styles.section}>
        <SectionLabel>Horaires du jour</SectionLabel>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (grids === null) {
    return (
      <View style={styles.section}>
        <SectionLabel>Horaires du jour</SectionLabel>
        <SkeletonRows count={4} />
      </View>
    );
  }

  if (grids.length === 0) {
    return (
      <View style={styles.section}>
        <SectionLabel>Horaires du jour</SectionLabel>
        <Text style={styles.muted}>Aucun passage prévu aujourd'hui sur cette ligne.</Text>
      </View>
    );
  }

  const toggleDirection = (direction: string) => {
    setExpandedDirections((prev) => {
      const next = new Set(prev);
      if (next.has(direction)) {
        next.delete(direction);
      } else {
        next.add(direction);
      }
      return next;
    });
  };

  const toggleStop = (direction: string, stopId: number) => {
    const key = stopScheduleKey(direction, stopId);
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <View style={styles.section}>
      <SectionLabel>Horaires du jour</SectionLabel>
      <Text style={styles.hint}>Touchez un sens, puis un arrêt, pour déplier les heures. Défilement horizontal une fois ouvert.</Text>
      {grids.map((board) => {
        const directionOpen = expandedDirections.has(board.direction);
        const activeRows = board.rows.filter((row) => row.times.length > 0);
        return (
          <View key={board.direction} style={styles.gridBlock}>
            <Pressable
              onPress={() => toggleDirection(board.direction)}
              style={({ pressed }) => [
                styles.directionHead,
                { borderLeftColor: color },
                t.elevation,
                pressed && styles.pressedHead,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: directionOpen }}
              accessibilityLabel={`Horaires vers ${board.direction}`}
            >
              <View style={styles.directionCopy}>
                <Text style={styles.directionTitle} numberOfLines={2}>
                  vers {board.direction}
                </Text>
                <Text style={styles.directionMeta}>
                  {activeRows.length} arrêt{activeRows.length > 1 ? "s" : ""} avec départs
                </Text>
              </View>
              <Icon
                name="chevron"
                color={t.colors.muted}
                size={20}
                style={directionOpen ? styles.chevronOpen : undefined}
              />
            </Pressable>
            {directionOpen ? (
              <View style={[styles.directionBody, t.elevation]}>
                {activeRows.length === 0 ? (
                  <Text style={styles.muted}>Aucun départ aujourd'hui.</Text>
                ) : (
                  activeRows.map((row, index) => {
                    const stopKey = stopScheduleKey(board.direction, row.stopId);
                    const stopOpen = expandedStops.has(stopKey);
                    const stopName = stopNames.get(row.stopId) ?? `Arrêt ${row.stopId}`;
                    const nextDeparture = nextDepartureLabel(row.times, nowLabel);
                    const nextIndex = row.times.findIndex((time) => time >= nowLabel);
                    return (
                      <View key={row.stopId} style={index < activeRows.length - 1 ? styles.stopDivider : undefined}>
                        <Pressable
                          onPress={() => toggleStop(board.direction, row.stopId)}
                          style={({ pressed }) => [styles.stopHead, pressed && styles.pressedHead]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: stopOpen }}
                          accessibilityLabel={`Horaires à ${stopName}`}
                        >
                          <View style={styles.stopHeadCopy}>
                            <Text style={styles.stopHeadName} numberOfLines={2}>
                              {stopName}
                            </Text>
                            <Text style={styles.stopHeadMeta}>
                              {stopOpen
                                ? `${row.times.length} départ${row.times.length > 1 ? "s" : ""}`
                                : nextDeparture
                                  ? `Prochain ${nextDeparture} · ${row.times.length} départ${row.times.length > 1 ? "s" : ""}`
                                  : "Sans départ"}
                            </Text>
                          </View>
                          <Icon
                            name="chevron"
                            color={t.colors.muted}
                            size={18}
                            style={stopOpen ? styles.chevronOpen : undefined}
                          />
                        </Pressable>
                        {stopOpen ? (
                          <ScrollView
                            horizontal
                            nestedScrollEnabled
                            showsHorizontalScrollIndicator
                            contentContainerStyle={styles.timesScrollContent}
                          >
                            <View style={styles.timeRow}>
                              {row.times.map((time, timeIndex) => (
                                <View key={`${row.stopId}-${time}-${timeIndex}`} style={styles.timeCell}>
                                  <Text style={[styles.timeText, timeIndex === nextIndex && styles.timeNext]}>{time}</Text>
                                </View>
                              ))}
                            </View>
                          </ScrollView>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function StopScheduleLightbox({
  visible,
  stop,
  code,
  color,
  stops,
  onClose,
  onOpenStop,
}: {
  visible: boolean;
  stop: Stop | null;
  code: string;
  color: string;
  stops: Stop[];
  onClose: () => void;
  onOpenStop: (stopId: number) => void;
}) {
  const styles = useLightboxStyles();
  const t = useTheme();
  const [board, setBoard] = useState<LineDayBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !stop) {
      return;
    }
    let cancelled = false;
    const stopIds = [stop.id, ...oppositePlatforms(stop, stops).map((platform) => platform.id)];
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
  }, [code, stop, stops, visible]);

  if (!stop) {
    return null;
  }

  const nowLabel = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" />
        <View style={[styles.panel, t.elevation]} accessibilityViewIsModal>
          <View style={[styles.panelAccent, { backgroundColor: color }]} />
          <View style={styles.panelHead}>
            <View style={styles.panelTop}>
              <LineChip line={code} />
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
              >
                <Icon name="close" color={t.colors.ink} size={20} />
              </Pressable>
            </View>
            <Text style={styles.panelTitle} numberOfLines={2}>
              {stop.name}
            </Text>
            <Text style={styles.panelMeta} numberOfLines={1}>
              {stop.commune}
            </Text>
            <Text style={styles.panelHint}>Horaires · aujourd'hui</Text>
          </View>
          <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelBody}>
            {board === null && !error ? <Text style={styles.muted}>Chargement des horaires…</Text> : null}
            {error ? <Text style={styles.muted}>{error}</Text> : null}
            {board && board.length === 0 ? (
              <Text style={styles.muted}>Aucun passage aujourd'hui à cet arrêt.</Text>
            ) : null}
            {board?.map((group) => {
              const nextIndex = group.times.findIndex((time) => time >= nowLabel);
              return (
                <View key={group.direction} style={styles.directionBlock}>
                  <Text style={styles.directionLabel} numberOfLines={2}>
                    vers {group.direction}
                  </Text>
                  <View style={styles.times}>
                    {group.times.map((time, index) => (
                      <Text
                        key={`${group.direction}-${time}`}
                        style={[styles.time, index === nextIndex && styles.timeNext]}
                      >
                        {time}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.panelFoot}>
            <Button
              icon="chevron"
              label="Fiche arrêt"
              onPress={() => onOpenStop(stop.id)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LineStopRow({
  stop,
  code,
  color,
  first,
  last,
  onPress,
}: {
  stop: Stop;
  code: string;
  color: string;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const t = useTheme();
  const connections = stop.lines.filter((line) => line !== code).slice(0, 6);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stop,
        first && styles.stopFirst,
        last && styles.stopLast,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${stop.name}, ${stop.commune}, horaires`}
    >
      <View style={[styles.dot, { borderColor: color }]} />
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
        <View style={styles.rowAction}>
          <Icon name="clock" color={t.colors.accent} size={18} />
          <Text style={styles.rowActionLabel}>Horaires</Text>
          <Icon name="chevron" color={t.colors.muted} size={16} />
        </View>
      </View>
    </Pressable>
  );
}

const useGridStyles = makeStyles((t) => ({
  section: {
    marginTop: t.space.lg,
    gap: t.space.sm,
  },
  hint: {
    ...t.type.caption,
    color: t.colors.muted,
    marginBottom: t.space.xs,
  },
  muted: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  directionTitle: {
    ...t.type.callout,
    fontWeight: "800",
    color: t.colors.ink,
  },
  gridBlock: {
    gap: t.space.xs,
    marginTop: t.space.md,
  },
  directionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderLeftWidth: 4,
    padding: t.space.md,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  directionCopy: {
    flex: 1,
    gap: 2,
  },
  directionMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  directionBody: {
    marginTop: t.space.xs,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
    overflow: "hidden",
    paddingBottom: t.space.xs,
  },
  stopDivider: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  stopHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
  },
  stopHeadCopy: {
    flex: 1,
    gap: 2,
  },
  stopHeadName: {
    ...t.type.bodyStrong,
    fontSize: 14,
    color: t.colors.ink,
  },
  stopHeadMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  pressedHead: {
    backgroundColor: t.colors.surfacePressed,
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  timesScrollContent: {
    paddingHorizontal: t.space.md,
    paddingBottom: t.space.sm,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeCell: {
    width: TIME_CELL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    ...t.type.time,
    fontSize: 13,
    color: t.colors.ink,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: "hidden",
  },
  timeNext: {
    backgroundColor: t.colors.accent,
    color: t.colors.accentInk,
  },
}));

const useLightboxStyles = makeStyles((t) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: t.space.lg,
    paddingVertical: t.space.xl,
  },
  backdrop: {
    ...({ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const),
    backgroundColor: "rgba(15, 18, 24, 0.55)",
  },
  panel: {
    maxHeight: "88%",
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.xl,
    overflow: "hidden",
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  panelAccent: {
    height: 5,
  },
  panelHead: {
    padding: t.space.lg,
    gap: t.space.xs,
  },
  panelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: t.space.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  panelTitle: {
    ...t.type.title,
    fontSize: 22,
    color: t.colors.ink,
  },
  panelMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  panelHint: {
    ...t.type.caption,
    color: t.colors.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: t.space.sm,
  },
  panelScroll: {
    flexGrow: 0,
  },
  panelBody: {
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.md,
    gap: t.space.md,
  },
  panelFoot: {
    padding: t.space.lg,
    paddingTop: t.space.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  directionBlock: {
    gap: t.space.sm,
  },
  directionLabel: {
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
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  timeNext: {
    backgroundColor: t.colors.accent,
    color: t.colors.accentInk,
  },
  muted: {
    ...t.type.caption,
    color: t.colors.muted,
  },
}));

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
  rowAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: t.space.xs,
  },
  rowActionLabel: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.accent,
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
