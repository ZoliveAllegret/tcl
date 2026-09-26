import { router, useNavigationContainerRef, usePathname } from "expo-router";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { requestNewSearch } from "@/src/search/session";
import { makeStyles, useTheme } from "@/src/theme";

type TabName = "index" | "trip" | "lines" | "map" | "favorites";

type Destination = {
  label: string;
  screen: TabName;
  href: "/" | "/trip" | "/lines" | "/map" | "/favorites";
  fresh?: "stops" | "lines";
  icon: IconName;
};

const DESTINATIONS: Destination[] = [
  { label: "Arrêts", screen: "index", href: "/", fresh: "stops", icon: "search" },
  { label: "Trajet", screen: "trip", href: "/trip", icon: "trip" },
  { label: "Lignes", screen: "lines", href: "/lines", fresh: "lines", icon: "lines" },
  { label: "Carte", screen: "map", href: "/map", icon: "map" },
  { label: "Favoris", screen: "favorites", href: "/favorites", icon: "star" },
];

const BAR_HEIGHT = 64;

export function useNavBarInset(): number {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + 24 + Math.max(insets.bottom, 10);
}

export function NavBar() {
  const styles = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const navigation = useNavigationContainerRef();

  function openDestination(destination: Destination) {
    if (destination.fresh) {
      requestNewSearch(destination.fresh);
    }
    if (router.canDismiss()) {
      router.dismissAll();
    }
    const tabsKey = navigation
      .getRootState()
      ?.routes.find((route) => route.name === "(tabs)")
      ?.state?.key;
    if (tabsKey) {
      navigation.dispatch({
        type: "JUMP_TO",
        target: tabsKey,
        payload: { name: destination.screen },
      });
      return;
    }
    router.navigate(destination.href);
  }

  const glass: ViewStyle =
    Platform.OS === "web"
      ? ({
          backdropFilter: "blur(22px) saturate(1.8)",
          WebkitBackdropFilter: "blur(22px) saturate(1.8)",
        } as ViewStyle)
      : {};

  return (
    <View
      style={[styles.bar, glass, t.floating, { bottom: Math.max(insets.bottom, 10) }]}
      accessibilityRole="tablist"
    >
      {DESTINATIONS.map((destination) => {
        const active = isActive(path, destination.screen);
        const color = active ? t.colors.navActiveInk : t.colors.navInk;
        return (
          <Pressable
            key={destination.screen}
            onPress={() => openDestination(destination)}
            style={({ pressed }) => [styles.item, active && styles.active, pressed && !active && styles.pressed]}
            accessibilityRole="tab"
            accessibilityLabel={destination.label}
            accessibilityState={{ selected: active }}
          >
            <Icon name={active && destination.icon === "star" ? "starFilled" : destination.icon} color={color} size={20} />
            <Text style={[styles.label, { color }]}>{destination.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function isActive(path: string, screen: TabName): boolean {
  if (screen === "index") {
    return path === "/";
  }
  if (screen === "lines") {
    return path === "/lines" || path.startsWith("/line/");
  }
  return path === `/${screen}`;
}

const useStyles = makeStyles((t) => ({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    maxWidth: 520,
    alignSelf: "center",
    marginHorizontal: "auto",
    flexDirection: "row",
    gap: 4,
    padding: 6,
    borderRadius: 24,
    backgroundColor: Platform.OS === "web" ? t.colors.nav : t.colors.navNative,
    borderWidth: 1,
    borderColor: t.colors.navBorder,
    zIndex: 20,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 18,
  },
  active: {
    backgroundColor: t.colors.navActive,
  },
  pressed: {
    backgroundColor: t.scheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(12, 15, 22, 0.05)",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
}));
