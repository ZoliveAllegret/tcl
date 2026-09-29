import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";

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
  const [lightboxStop, setLightboxStop] = useState<Stop | null>(null);
  const lineStops = useMemo(() => {
    if (passageOrder === undefined) {
      return [];
    }
    return stopsOnLine(stops, code, passageOrder);
  }, [code, passageOrder, stops]);
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
            onPress={() => setLightboxStop(item)}
          />
        )}
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
          <View style={styles.panelHead}>
            <View style={[styles.panelBand, { backgroundColor: color }]} />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Icon name="close" color={t.colors.muted} size={22} />
            </Pressable>
            <LineChip line={code} />
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
        <Icon name="clock" color={t.colors.muted} size={20} />
      </View>
    </Pressable>
  );
}

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
  panelBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  panelHead: {
    padding: t.space.lg,
    paddingTop: t.space.lg + 4,
    gap: t.space.xs,
  },
  close: {
    position: "absolute",
    top: t.space.md,
    right: t.space.md,
    zIndex: 1,
    padding: 4,
  },
  panelTitle: {
    ...t.type.title,
    fontSize: 22,
    color: t.colors.ink,
    paddingRight: t.space.xl,
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
