import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { StyleProp, ViewStyle } from "react-native";

/** Jeu d'icônes de l'app : SF Symbols sur iOS, Material Symbols sur Android et le web. */
const ICONS = {
  search: { ios: "magnifyingglass", md: "search" },
  lines: { ios: "point.topleft.down.to.point.bottomright.curvepath", md: "route" },
  trip: { ios: "arrow.triangle.turn.up.right.diamond.fill", md: "alt_route" },
  swap: { ios: "arrow.up.arrow.down", md: "swap_vert" },
  map: { ios: "map", md: "map" },
  star: { ios: "star", md: "star" },
  starFilled: { ios: "star.fill", md: "star" },
  locate: { ios: "location.fill", md: "near_me" },
  close: { ios: "xmark", md: "close" },
  chevron: { ios: "chevron.right", md: "chevron_right" },
  back: { ios: "chevron.left", md: "arrow_back" },
  clock: { ios: "clock", md: "schedule" },
  live: { ios: "dot.radiowaves.left.and.right", md: "sensors" },
  accessible: { ios: "figure.roll", md: "accessible" },
  metro: { ios: "tram.tunnel.fill", md: "subway" },
  tram: { ios: "tram.fill", md: "tram" },
  bus: { ios: "bus.fill", md: "directions_bus" },
  place: { ios: "mappin.and.ellipse", md: "location_on" },
  offline: { ios: "wifi.slash", md: "wifi_off" },
  empty: { ios: "magnifyingglass", md: "search_off" },
  refresh: { ios: "arrow.clockwise", md: "refresh" },
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, color, size = 22, style }: IconProps) {
  const icon = ICONS[name];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.md, web: icon.md } as SymbolViewProps["name"]}
      tintColor={color}
      size={size}
      style={style}
    />
  );
}
