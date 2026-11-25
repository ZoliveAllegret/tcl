import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { LineChip } from "@/components/LineChip";
import { NavBar, useNavBarInset } from "@/components/NavBar";
import { Badge, Button, EmptyState, SectionLabel, SkeletonRows } from "@/components/ui";
import { useLineDisruptions } from "@/src/hooks/useDisruptionCounts";
import { partitionStopsOnLine } from "@/src/lines/groupLines";
import { loadPreparedLineOrder, loadPreparedTimetable } from "@/src/schedule/prepared";
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
  const [lightboxStop, setLightboxStop] = useState<Stop | null>(null);
  const orderReady = passageOrder !== undefined;
  const { mainStops, extraStops } = useMemo(
    () => partitionStopsOnLine(stops, code, orderReady ? passageOrder : undefined),
    [code, orderReady, passageOrder, stops],
  );
  const lineStops = useMemo(() => [...mainStops, ...extraStops], [extraStops, mainStops]);
  const { disruptions, loading: disruptionsLoading } = useLineDisruptions(code);

  useEffect(() => {
    let cancelled = false;
    setPassageOrder(undefined);
    setLightboxStop(null);
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
        data={lineStops}
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
            {lineStops.length > 0 ? (
              <LineDayTimetableSection code={code} color={color} lineStops={lineStops} stops={stops} />
            ) : null}
            {!orderReady && stops.length === 0 ? (
              <View style={styles.pending}>
                <Text style={styles.hint}>Chargement de la ligne…</Text>
                <SkeletonRows count={3} />
              </View>
            ) : lineStops.length > 0 ? (
              <View>
                <SectionLabel>
                  {orderReady ? "Arrêts · ordre de passage" : "Arrêts · ordre de passage (chargement…)"}
                </SectionLabel>
                <Text style={styles.listHint}>Appuyez sur un arrêt pour voir les horaires du jour.</Text>
                {extraStops.length > 0 ? (
                  <Text style={styles.listHint}>
                    {extraStops.length} arrêt{extraStops.length > 1 ? "s" : ""} dessert{extraStops.length > 1 ? "ent" : ""} la ligne
                    hors tracé principal (embranchements, terminus courts…).
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="empty" title="Aucun arrêt pour cette ligne" />}
        renderItem={({ item, index }) => {
          const extraStart = mainStops.length;
          const first = index === 0 || index === extraStart;
          const last = index === lineStops.length - 1;
          const showExtraLabel = index === extraStart && extraStops.length > 0;
          return (
            <View>
              {showExtraLabel ? (
                <View style={styles.extraHeader}>
                  <SectionLabel>Autres arrêts sur la ligne</SectionLabel>
                </View>
              ) : null}
              <LineStopRow
                stop={item}
                code={code}
                color={color}
                first={first}
                last={last}
                onPress={() => setLightboxStop(item)}
              />
            </View>
          );
        }}
      />
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

const STOP_COL_WIDTH = 128;
const TIME_CELL_WIDTH = 54;
const TIME_ROW_HEIGHT = 44;

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
  const [summary, setSummary] = useState<LineDayBoard[] | null>(null);
  const [grids, setGrids] = useState<LineDirectionStopBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopNames = useMemo(() => new Map(lineStops.map((stop) => [stop.id, stop.name])), [lineStops]);
  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    [summary, grids],
  );

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setGrids(null);
    setError(null);
    const platformIds = (stop: Stop) => [stop.id, ...oppositePlatforms(stop, stops).map((platform) => platform.id)];
    const allIds = [...new Set(lineStops.flatMap((stop) => platformIds(stop)))];
    void loadPreparedTimetable()
      .then((table) => {
        if (cancelled) {
          return;
        }
        const day = new Date();
        setSummary(lineDayBoard(table, allIds, code, day));
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

  if (summary === null || grids === null) {
    return (
      <View style={styles.section}>
        <SectionLabel>Horaires du jour</SectionLabel>
        <SkeletonRows count={4} />
      </View>
    );
  }

  if (summary.length === 0 && grids.length === 0) {
    return (
      <View style={styles.section}>
        <SectionLabel>Horaires du jour</SectionLabel>
        <Text style={styles.muted}>Aucun passage prévu aujourd'hui sur cette ligne.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionLabel>Horaires du jour</SectionLabel>
      <Text style={styles.hint}>Faites défiler horizontalement pour parcourir toutes les heures.</Text>
      {summary.map((group) => {
        const nextIndex = group.times.findIndex((time) => time >= nowLabel);
        return (
          <View key={`sum-${group.direction}`} style={styles.summaryBlock}>
            <Text style={styles.directionTitle} numberOfLines={2}>
              vers {group.direction}
            </Text>
            <View style={styles.summaryTimes}>
              {group.times.map((time, index) => (
                <Text
                  key={`${group.direction}-${time}-${index}`}
                  style={[styles.summaryTime, index === nextIndex && styles.timeNext]}
                >
                  {time}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
      {grids.map((board) => (
        <View key={board.direction} style={styles.gridBlock}>
          <Text style={styles.directionTitle} numberOfLines={2}>
            Tableau · vers {board.direction}
          </Text>
          <View style={[styles.gridShell, t.elevation]}>
            <View style={[styles.gridHead, { borderLeftColor: color }]}>
              <View style={[styles.stopHeadCell, { width: STOP_COL_WIDTH }]}>
                <Text style={styles.headLabel}>Arrêt</Text>
              </View>
              <Text style={styles.headScrollHint}>Heures →</Text>
            </View>
            <View style={styles.gridBody}>
              <View style={{ width: STOP_COL_WIDTH }}>
                {board.rows.map((row, index) => (
                  <View
                    key={row.stopId}
                    style={[
                      styles.stopCell,
                      index < board.rows.length - 1 && styles.gridRowDivider,
                      { height: TIME_ROW_HEIGHT },
                    ]}
                  >
                    <Text style={styles.stopCellName} numberOfLines={2}>
                      {stopNames.get(row.stopId) ?? `Arrêt ${row.stopId}`}
                    </Text>
                  </View>
                ))}
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.timesScrollContent}
              >
                <View>
                  {board.rows.map((row, rowIndex) => {
                    const nextIndex = row.times.findIndex((time) => time >= nowLabel);
                    return (
                      <View
                        key={row.stopId}
                        style={[
                          styles.timeRow,
                          rowIndex < board.rows.length - 1 && styles.gridRowDivider,
                        ]}
                      >
                        {row.times.length === 0 ? (
                          <Text style={styles.emptyCell}>—</Text>
                        ) : (
                          row.times.map((time, index) => (
                            <View key={`${row.stopId}-${time}-${index}`} style={styles.timeCell}>
                              <Text style={[styles.timeText, index === nextIndex && styles.timeNext]}>{time}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      ))}
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
  summaryBlock: {
    gap: t.space.xs,
    marginBottom: t.space.sm,
  },
  directionTitle: {
    ...t.type.callout,
    fontWeight: "800",
    color: t.colors.ink,
  },
  summaryTimes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  summaryTime: {
    ...t.type.time,
    color: t.colors.ink,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  gridBlock: {
    gap: t.space.sm,
    marginTop: t.space.md,
  },
  gridShell: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    overflow: "hidden",
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  gridHead: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    paddingHorizontal: t.space.sm,
    paddingVertical: t.space.sm,
    backgroundColor: t.colors.surfaceMuted,
    gap: t.space.sm,
  },
  stopHeadCell: {
    justifyContent: "center",
  },
  headLabel: {
    ...t.type.caption,
    fontWeight: "800",
    color: t.colors.ink,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  headScrollHint: {
    ...t.type.caption,
    color: t.colors.muted,
    flex: 1,
  },
  gridBody: {
    flexDirection: "row",
  },
  stopCell: {
    width: STOP_COL_WIDTH,
    paddingHorizontal: t.space.sm,
    justifyContent: "center",
    backgroundColor: t.colors.surface,
  },
  stopCellName: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.ink,
    fontSize: 12,
    lineHeight: 15,
  },
  timesScrollContent: {
    paddingRight: t.space.md,
  },
  timeRow: {
    flexDirection: "row",
    height: 44,
    alignItems: "center",
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
  emptyCell: {
    ...t.type.caption,
    color: t.colors.muted,
    paddingHorizontal: t.space.sm,
  },
  gridRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
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
  listHint: {
    ...t.type.caption,
    color: t.colors.muted,
    marginBottom: t.space.sm,
  },
  extraHeader: {
    marginTop: t.space.md,
    marginBottom: t.space.xs,
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
