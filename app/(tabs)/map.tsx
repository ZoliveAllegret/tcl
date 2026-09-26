import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LineChip } from "@/components/LineChip";
import { useNavBarInset } from "@/components/NavBar";
import { Badge, IconButton, LiveDot, SearchField } from "@/components/ui";
import { NetworkMap, type NetworkMapHandle } from "@/components/NetworkMap";
import { LYON_CENTER } from "@/src/config";
import { formatClock } from "@/src/format";
import { isInsideRegion, nearestStops } from "@/src/geo";
import { boundsOf } from "@/src/geo";
import { useLineTraces } from "@/src/hooks/useLineTraces";
import { useUserLocation } from "@/src/hooks/useUserLocation";
import { useVehicles } from "@/src/hooks/useVehicles";
import { collectLines } from "@/src/lines/groupLines";
import { useStops } from "@/src/stops/StopsProvider";
import { lineColor, makeStyles, stopColor, useTheme, vehicleMarkerColor, vehicleMode } from "@/src/theme";
import type { MapRegion } from "@/src/types";

export default function MapScreen() {
  const styles = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NetworkMapHandle>(null);
  const navInset = useNavBarInset();
  const { stops, getStop } = useStops();
  const userLocation = useUserLocation();
  const { vehicles, loading, error, updatedAt } = useVehicles(true);
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [lineQuery, setLineQuery] = useState("");
  const [shownLines, setShownLines] = useState<string[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const { trace } = useLocalSearchParams<{ trace?: string }>();
  const fittedKey = useRef("");

  const onRegionChange = useCallback((next: MapRegion) => {
    setRegion((current) => {
      if (
        current &&
        Math.abs(current.latitude - next.latitude) < 0.00001 &&
        Math.abs(current.longitude - next.longitude) < 0.00001 &&
        Math.abs(current.latitudeDelta - next.latitudeDelta) < 0.00001
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const visibleStops = useMemo(() => {
    if (!region) {
      return [];
    }
    const inside = stops.filter((stop) => isInsideRegion(stop, region));
    if (inside.length <= 140) {
      return inside;
    }
    return nearestStops(inside, region, 140, Number.POSITIVE_INFINITY);
  }, [region, stops]);

  const catalog = useMemo(() => collectLines(stops), [stops]);
  const { traces, loading: tracesLoading, missing } = useLineTraces(shownLines);

  const suggestions = useMemo(() => {
    const query = lineQuery.trim().toLowerCase();
    if (query.length < 1) {
      return [];
    }
    return catalog
      .filter((line) => line.code.toLowerCase().startsWith(query) && !shownLines.includes(line.code))
      .slice(0, 8);
  }, [catalog, lineQuery, shownLines]);

  const showLine = useCallback((code: string) => {
    const match = catalog.find((line) => line.code.toLowerCase() === code.trim().toLowerCase());
    const next = match?.code ?? code.trim().toUpperCase();
    if (!/^[A-Za-z0-9]+$/.test(next)) {
      return;
    }
    setShownLines((current) => (current.includes(next) ? current : [...current, next]));
    setLineQuery("");
  }, [catalog]);

  const hideLine = useCallback((code: string) => {
    setShownLines((current) => current.filter((item) => item !== code));
  }, []);

  useEffect(() => {
    if (typeof trace === "string" && trace.length > 0) {
      showLine(trace);
    }
  }, [showLine, trace]);

  useEffect(() => {
    const key = traces.map((traceItem) => traceItem.code).join("|");
    if (!key) {
      fittedKey.current = "";
      return;
    }
    if (key === fittedKey.current) {
      return;
    }
    const bounds = boundsOf(traces.flatMap((traceItem) => traceItem.paths.flat()));
    if (!bounds) {
      return;
    }
    fittedKey.current = key;
    mapRef.current?.fitTo(bounds);
  }, [traces]);

  const visibleVehicles = useMemo(() => {
    const query = lineQuery.trim().toLowerCase();
    const selected = new Set(shownLines.map((code) => code.toLowerCase()));
    return vehicles.filter((vehicle) => {
      if (selected.size > 0) {
        if (!selected.has(vehicle.line.toLowerCase())) {
          return false;
        }
      } else if (query && !vehicle.line.toLowerCase().includes(query)) {
        return false;
      }
      return region ? isInsideRegion(vehicle, region, 0.02) : true;
    });
  }, [lineQuery, region, shownLines, vehicles]);

  const selected = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const destination = selected?.destinationStopId ? getStop(selected.destinationStopId) : undefined;

  return (
    <View style={styles.screen}>
      <NetworkMap
        ref={mapRef}
        userLocation={userLocation}
        selectedVehicleId={selectedVehicleId}
        onRegionChange={onRegionChange}
        onSelectStop={(id) => router.push({ pathname: "/stop/[id]", params: { id: String(id) } })}
        onSelectVehicle={setSelectedVehicleId}
        lines={traces}
        stops={visibleStops.map((stop) => ({
          id: stop.id,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          lines: stop.lines,
          color: stopColor(stop.lines),
        }))}
        vehicles={visibleVehicles.map((vehicle) => ({
          id: vehicle.id,
          line: vehicle.line,
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          bearing: vehicle.bearing,
          delayLabel: vehicle.delayLabel,
          destination: vehicle.destinationStopId ? (getStop(vehicle.destinationStopId)?.name ?? null) : null,
          color: vehicleMarkerColor(lineColor(vehicle.line)),
          mode: vehicleMode(vehicle.line),
        }))}
      />
      <View style={[styles.topBar, { top: insets.top + 10 }]} pointerEvents="box-none">
        <SearchField
          floating
          value={lineQuery}
          onChangeText={setLineQuery}
          placeholder="Afficher une ligne : C3, T1…"
          autoCapitalize="characters"
          style={styles.filter}
          onSubmitEditing={() => {
            if (suggestions[0]) {
              showLine(suggestions[0].code);
            } else if (lineQuery.trim()) {
              showLine(lineQuery);
            }
          }}
        />
        <IconButton
          icon="locate"
          label="Centrer sur ma position"
          onPress={() => mapRef.current?.focusOn(userLocation ?? LYON_CENTER)}
          size={52}
          style={t.floating}
        />
      </View>
      {suggestions.length > 0 || shownLines.length > 0 ? (
        <View style={[styles.chooser, { top: insets.top + 72 }]} pointerEvents="box-none">
          {suggestions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {suggestions.map((line) => (
                <Pressable
                  key={line.code}
                  onPress={() => showLine(line.code)}
                  accessibilityRole="button"
                  accessibilityLabel={`Afficher le tracé ${line.code}`}
                >
                  <LineChip line={line.code} size="sm" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {shownLines.length > 0 ? (
            <View style={styles.shownRow}>
              {shownLines.map((code) => (
                <Pressable
                  key={code}
                  onPress={() => hideLine(code)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer le tracé ${code}`}
                  style={styles.shownChip}
                >
                  <LineChip line={code} size="sm" />
                  <Text style={styles.shownClose}>×</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.sheet, t.floating, { bottom: navInset - 12 }]}>
        {selected ? (
          <View style={styles.sheetRow}>
            <LineChip line={selected.line} size="lg" />
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {destination ? `Vers ${destination.name}` : "Destination non publiée"}
              </Text>
              <View style={styles.sheetMetaRow}>
                {selected.delayLabel ? (
                  <Badge tone={selected.delayLabel.startsWith("+") ? "scheduled" : "live"}>{selected.delayLabel}</Badge>
                ) : null}
                {selected.recordedAt ? (
                  <Text style={styles.sheetMeta}>Position à {formatClock(selected.recordedAt)}</Text>
                ) : null}
              </View>
            </View>
            <IconButton
              icon="close"
              label="Fermer"
              size={34}
              onPress={() => setSelectedVehicleId(null)}
              style={styles.close}
            />
          </View>
        ) : (
          <View style={styles.sheetRow}>
            <LiveDot color={error ? t.colors.danger : undefined} />
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetTitle}>
                {loading && vehicles.length === 0
                  ? "Chargement des véhicules…"
                  : visibleVehicles.length === 1
                    ? "1 véhicule à l'écran"
                    : `${visibleVehicles.length} véhicules à l'écran`}
              </Text>
              <Text style={styles.sheetMeta} numberOfLines={1}>
                {error ??
                  (tracesLoading
                    ? "Chargement du tracé…"
                    : missing.length > 0
                      ? `Pas de tracé publié pour ${missing.join(", ")}`
                      : shownLines.length > 0
                        ? `Tracé ${shownLines.join(", ")}`
                        : updatedAt
                          ? `Mis à jour à ${formatClock(updatedAt.toISOString())}`
                          : "Positions en temps réel")}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topBar: {
    position: "absolute",
    zIndex: 2,
    left: t.space.lg,
    right: t.space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
  },
  filter: {
    flex: 1,
  },
  chooser: {
    position: "absolute",
    zIndex: 2,
    left: t.space.lg,
    right: 76,
    gap: t.space.sm,
  },
  choiceRow: {
    gap: t.space.sm,
    paddingRight: t.space.md,
  },
  shownRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space.sm,
  },
  shownChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingRight: 8,
    paddingVertical: 3,
    paddingLeft: 3,
  },
  shownClose: {
    color: t.colors.muted,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  sheet: {
    position: "absolute",
    zIndex: 2,
    left: t.space.lg,
    right: t.space.lg,
    maxWidth: 520,
    marginHorizontal: "auto",
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md + 2,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
  },
  sheetCopy: {
    flex: 1,
    gap: 3,
  },
  sheetTitle: {
    ...t.type.bodyStrong,
    color: t.colors.ink,
  },
  sheetMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
  },
  sheetMeta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  close: {
    backgroundColor: t.colors.surfaceMuted,
  },
}));
