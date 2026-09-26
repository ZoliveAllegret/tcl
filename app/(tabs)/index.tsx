import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SectionList, Text, TextInput, View } from "react-native";

import { useNavBarInset } from "@/components/NavBar";
import { StopRow } from "@/components/StopRow";
import { Badge, Button, EmptyState, ScreenHeader, SearchField, SectionLabel, SkeletonRows } from "@/components/ui";
import { useFavorites } from "@/src/favorites/FavoritesProvider";
import { distanceMeters, formatDistance, nearestStops } from "@/src/geo";
import { normalizeText } from "@/src/format";
import { useUserLocation } from "@/src/hooks/useUserLocation";
import { searchTarget, searchToken, subscribeSearch } from "@/src/search/session";
import { useStops } from "@/src/stops/StopsProvider";
import { makeStyles } from "@/src/theme";
import type { Stop } from "@/src/types";

function openStop(stop: Stop) {
  router.push({ pathname: "/stop/[id]", params: { id: String(stop.id) } });
}

export default function SearchScreen() {
  const styles = useStyles();
  const { stops, loading, error, loadedCount, refresh } = useStops();
  const { ids } = useFavorites();
  const userLocation = useUserLocation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const token = useSyncExternalStore(subscribeSearch, searchToken, searchToken);
  const navInset = useNavBarInset();

  useEffect(() => {
    if (token === 0 || searchTarget() !== "stops") {
      return;
    }
    setQuery("");
    inputRef.current?.focus();
  }, [token]);

  const normalized = normalizeText(query);
  const results = useMemo(() => {
    if (normalized.length < 2) {
      return [];
    }
    const prefix: Stop[] = [];
    const contains: Stop[] = [];
    for (const stop of stops) {
      const name = normalizeText(stop.name);
      const commune = normalizeText(stop.commune);
      if (name.startsWith(normalized)) {
        prefix.push(stop);
      } else if (name.includes(normalized) || commune.includes(normalized)) {
        contains.push(stop);
      }
    }
    return [...prefix, ...contains].slice(0, 40);
  }, [normalized, stops]);

  const favorites = useMemo(
    () => ids.map((id) => stops.find((stop) => stop.id === id)).filter((stop): stop is Stop => Boolean(stop)),
    [ids, stops],
  );

  const nearby = useMemo(() => {
    if (!userLocation || normalized.length >= 2) {
      return [];
    }
    return nearestStops(stops, userLocation, 8, 1200);
  }, [normalized.length, stops, userLocation]);

  const sections = useMemo(() => {
    const rows = (prefix: string, items: Stop[]) =>
      items.map((stop) => ({ ...stop, rowKey: `${prefix}-${stop.id}` }));
    if (normalized.length >= 2) {
      return results.length === 0 ? [] : [{ title: "Résultats", data: rows("result", results) }];
    }
    const next: { title: string; data: Array<Stop & { rowKey: string }> }[] = [];
    if (favorites.length > 0) {
      next.push({ title: "Favoris", data: rows("favorite", favorites) });
    }
    if (nearby.length > 0) {
      next.push({ title: "Autour de vous", data: rows("nearby", nearby) });
    }
    return next;
  }, [favorites, nearby, normalized.length, results]);

  const searching = normalized.length >= 2;
  const waiting = loading && stops.length === 0;
  const failed = Boolean(error) && stops.length === 0;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={waiting || failed ? [] : sections}
        keyExtractor={(stop) => stop.rowKey}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: navInset }]}
        ListHeaderComponent={
          <ScreenHeader
            title="Arrêts"
            right={userLocation ? <Badge tone="accent" icon="locate">Position active</Badge> : null}
          >
            <SearchField
              inputRef={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Arrêt ou commune"
              autoCapitalize="words"
            />
          </ScreenHeader>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.inset}>
            <SectionLabel trailing={<Text style={styles.count}>{section.data.length}</Text>}>
              {section.title}
            </SectionLabel>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.inset}>
            <StopRow
              stop={item}
              detail={
                userLocation
                  ? formatDistance(
                      distanceMeters(userLocation, {
                        latitude: item.latitude,
                        longitude: item.longitude,
                      }),
                    )
                  : undefined
              }
              onPress={openStop}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.inset}>
            {waiting ? (
              <View style={styles.loading}>
                <Text style={styles.loadingLabel}>
                  {loadedCount > 0 ? `${loadedCount} arrêts chargés…` : "Chargement des arrêts TCL…"}
                </Text>
                <SkeletonRows />
              </View>
            ) : failed ? (
              <EmptyState
                tone="danger"
                icon="offline"
                title="Arrêts indisponibles"
                message={error ?? undefined}
                action={<Button label="Réessayer" icon="refresh" onPress={() => void refresh()} />}
              />
            ) : searching ? (
              <EmptyState
                icon="empty"
                title="Aucun arrêt trouvé"
                message={`Rien ne correspond à « ${query.trim()} ». Essayez un autre nom ou une commune.`}
              />
            ) : (
              <EmptyState
                icon="search"
                title="Cherchez un arrêt"
                message="Saisissez au moins deux lettres. Vos favoris et les arrêts proches apparaîtront ici."
              />
            )}
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  list: {
    flexGrow: 1,
  },
  inset: {
    paddingHorizontal: t.space.lg,
  },
  count: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.muted,
    fontVariant: ["tabular-nums"],
  },
  loading: {
    gap: t.space.md,
    paddingTop: t.space.md,
  },
  loadingLabel: {
    ...t.type.caption,
    color: t.colors.muted,
  },
}));
