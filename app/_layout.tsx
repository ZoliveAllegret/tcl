import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { FavoritesProvider } from "@/src/favorites/FavoritesProvider";
import { warmTheoreticalSchedule } from "@/src/schedule/theoretical";
import { StopsProvider } from "@/src/stops/StopsProvider";
import { ThemeProvider, useTheme } from "@/src/theme";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
    warmTheoreticalSchedule();
  }, []);

  return (
    <ThemeProvider>
      <StopsProvider>
        <FavoritesProvider>
          <ThemedStack />
        </FavoritesProvider>
      </StopsProvider>
    </ThemeProvider>
  );
}

function ThemedStack() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "700", color: colors.ink },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="stop/[id]" options={{ title: "" }} />
        <Stack.Screen name="line/[code]" options={{ title: "" }} />
        <Stack.Screen name="+not-found" options={{ title: "" }} />
      </Stack>
    </>
  );
}
