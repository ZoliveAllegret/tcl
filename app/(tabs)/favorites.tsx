import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, View } from "react-native";

import { useNavBarInset } from "@/components/NavBar";
import { StopRow } from "@/components/StopRow";
import { Button, EmptyState, ScreenHeader, SkeletonRows } from "@/components/ui";
import { useFavorites } from "@/src/favorites/FavoritesProvider";
import { useStops } from "@/src/stops/StopsProvider";
import { makeStyles } from "@/src/theme";
import type { Stop } from "@/src/types";

export default function FavoritesScreen() {
  const styles = useStyles();
  const { ids, ready } = useFavorites();
  const { stops, loading } = useStops();
  const navInset = useNavBarInset();

  const favorites = useMemo(
    () => ids.map((id) => stops.find((stop) => stop.id === id)).filter((stop): stop is Stop => Boolean(stop)),
    [ids, stops],
  );
  const waiting = !ready || (ids.length > 0 && stops.length === 0 && loading);

  return (
    <View style={styles.screen}>
      <FlatList
        data={favorites}
        keyExtractor={(stop) => String(stop.id)}
        contentContainerStyle={[styles.list, { paddingBottom: navInset }]}
        ListHeaderComponent={
          <ScreenHeader
            title="Favoris"
            subtitle={
              favorites.length > 0
                ? `${favorites.length} ${favorites.length > 1 ? "arrêts enregistrés" : "arrêt enregistré"} sur cet appareil`
                : undefined
            }
          />
        }
        ListEmptyComponent={
          <View style={styles.inset}>
            {waiting ? (
              <SkeletonRows count={3} />
            ) : (
              <EmptyState
                icon="star"
                title="Aucun favori pour l'instant"
                message="Ouvrez un arrêt et touchez l'étoile pour le retrouver ici en un geste."
                action={<Button label="Chercher un arrêt" icon="search" onPress={() => router.navigate("/")} />}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.inset}>
            <StopRow
              stop={item}
              onPress={(stop) => router.push({ pathname: "/stop/[id]", params: { id: String(stop.id) } })}
            />
          </View>
        )}
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
}));
