import { Tabs } from "expo-router";

import { NavBar } from "@/components/NavBar";
import { useTheme } from "@/src/theme";

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={() => <NavBar />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Arrêts" }} />
      <Tabs.Screen name="trip" options={{ title: "Trajet" }} />
      <Tabs.Screen name="lines" options={{ title: "Lignes" }} />
      <Tabs.Screen name="map" options={{ title: "Carte" }} />
      <Tabs.Screen name="favorites" options={{ title: "Favoris" }} />
    </Tabs>
  );
}
