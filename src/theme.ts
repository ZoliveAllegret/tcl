import { createContext, createElement, useContext, type ReactNode } from "react";
import { Platform, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import { useColorScheme } from "@/components/useColorScheme";

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

export type ColorScheme = "light" | "dark";

export type Palette = {
  /** Fond de l'application. */
  background: string;
  /** Cartes, champs, feuilles. */
  surface: string;
  /** Surfaces secondaires : pastilles d'horaires, champs au repos. */
  surfaceMuted: string;
  /** Surface pressée. */
  surfacePressed: string;
  ink: string;
  inkSoft: string;
  muted: string;
  border: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  live: string;
  liveSoft: string;
  scheduled: string;
  scheduledSoft: string;
  danger: string;
  dangerSoft: string;
  /** Barre de navigation flottante : fond translucide (web, avec flou) et fond opaque (natif). */
  nav: string;
  navNative: string;
  navBorder: string;
  navInk: string;
  navActive: string;
  navActiveInk: string;
  shadow: string;
  /** Couleur neutre des lignes sans couleur publique. */
  lineNeutral: string;
};

const light: Palette = {
  background: "#F2F3F6",
  surface: "#FFFFFF",
  surfaceMuted: "#E8EAF0",
  surfacePressed: "#F6F7FA",
  ink: "#0C0F16",
  inkSoft: "#394050",
  muted: "#687084",
  border: "#E0E3EA",
  accent: "#3B34F0",
  accentInk: "#FFFFFF",
  accentSoft: "#E7E6FE",
  live: "#07875A",
  liveSoft: "#DCF4E9",
  scheduled: "#9A5B00",
  scheduledSoft: "#FAEEDA",
  danger: "#D0301F",
  dangerSoft: "#FCE7E4",
  nav: "rgba(255, 255, 255, 0.62)",
  navNative: "rgba(255, 255, 255, 0.96)",
  navBorder: "rgba(255, 255, 255, 0.85)",
  navInk: "#4B5265",
  navActive: "#3B34F0",
  navActiveInk: "#FFFFFF",
  shadow: "#0C0F16",
  lineNeutral: "#2E3442",
};

const dark: Palette = {
  background: "#090B10",
  surface: "#131720",
  surfaceMuted: "#1D222D",
  surfacePressed: "#1A1F29",
  ink: "#F2F4F8",
  inkSoft: "#C7CDD9",
  muted: "#8A92A4",
  border: "#232937",
  accent: "#8E88FF",
  accentInk: "#0B0B1A",
  accentSoft: "#23214C",
  live: "#3EDB98",
  liveSoft: "#0E2C21",
  scheduled: "#F4B54A",
  scheduledSoft: "#30240E",
  danger: "#FF6F61",
  dangerSoft: "#3A1713",
  nav: "rgba(26, 31, 42, 0.72)",
  navNative: "#1A1F2A",
  navBorder: "rgba(255, 255, 255, 0.08)",
  navInk: "#8A92A4",
  navActive: "#8E88FF",
  navActiveInk: "#0B0B1A",
  shadow: "#000000",
  lineNeutral: "#3A4152",
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: "800", letterSpacing: -1.1 },
  title: { fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.7 },
  headline: { fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  bodyStrong: { fontSize: 16, lineHeight: 21, fontWeight: "700", letterSpacing: -0.15 },
  callout: { fontSize: 14, lineHeight: 19, fontWeight: "500" },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: "500" },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  numeral: { fontSize: 30, lineHeight: 32, fontWeight: "800", letterSpacing: -1, fontVariant: tabular },
  time: { fontSize: 16, lineHeight: 20, fontWeight: "700", fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  /** Ombre douce des cartes. */
  elevation: ViewStyle;
  /** Ombre marquée des éléments flottants. */
  floating: ViewStyle;
};

function shadow(color: string, opacity: number, radiusValue: number, offset: number, elevation: number): ViewStyle {
  if (Platform.OS === "web") {
    return { boxShadow: `0 ${offset}px ${radiusValue * 2}px rgba(0, 0, 0, ${opacity})` } as ViewStyle;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offset },
    shadowOpacity: opacity,
    shadowRadius: radiusValue,
    elevation,
  };
}

function buildTheme(scheme: ColorScheme): Theme {
  const colors = palettes[scheme];
  const strength = scheme === "dark" ? 3 : 1;
  return {
    scheme,
    colors,
    space,
    radius,
    type,
    elevation: scheme === "dark" ? {} : shadow(colors.shadow, 0.06, 10, 4, 2),
    floating: shadow(colors.shadow, 0.16 * strength, 14, 8, 8),
  };
}

export const themes: Record<ColorScheme, Theme> = {
  light: buildTheme("light"),
  dark: buildTheme("dark"),
};

/* ------------------------------------------------------------------ */
/* Provider et hooks                                                   */
/* ------------------------------------------------------------------ */

const ThemeContext = createContext<Theme>(themes.light);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return createElement(ThemeContext.Provider, { value: themes[scheme] }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | object };

/**
 * Déclare des styles qui dépendent du thème.
 * `const useStyles = makeStyles((t) => ({ … }))`, puis `const styles = useStyles()`.
 */
export function makeStyles<T extends NamedStyles<T>>(factory: (theme: Theme) => T) {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme) as never) as T;
      cache.set(theme, styles);
    }
    return styles;
  };
}

/* ------------------------------------------------------------------ */
/* Lignes et véhicules                                                 */
/* ------------------------------------------------------------------ */

/** Couleurs publiques des lignes fortes. */
const LINE_COLORS: Record<string, string> = {
  A: "#E4007F",
  B: "#0070C0",
  C: "#F5A000",
  D: "#00A04A",
};

export const NEUTRAL_LINE = "#3F3A36";

export function lineColor(line: string): string {
  if (LINE_COLORS[line]) {
    return LINE_COLORS[line];
  }
  if (line.startsWith("T")) {
    return "#7A2E68";
  }
  if (line.startsWith("C")) {
    return "#1F4E79";
  }
  return NEUTRAL_LINE;
}

/** Les bus sans couleur de ligne publique s'affichent en bleu sur la carte. */
export function vehicleMarkerColor(color: string): string {
  return color === NEUTRAL_LINE ? "#2F6FE4" : color;
}

export type VehicleMode = "metro" | "tram" | "bus";

/** Métro A–D, tramway T1…, le reste est un bus (lignes C et navettes comprises). */
export function vehicleMode(line: string): VehicleMode {
  if (/^[ABCD]$/.test(line)) {
    return "metro";
  }
  if (/^T\d/.test(line)) {
    return "tram";
  }
  return "bus";
}

/** Couleur d'un arrêt sur la carte : sa ligne la plus structurante (métro, puis tram), sinon null. */
export function stopColor(lines: string[]): string | null {
  const metro = lines.find((line) => vehicleMode(line) === "metro");
  if (metro) {
    return lineColor(metro);
  }
  const tram = lines.find((line) => vehicleMode(line) === "tram");
  return tram ? lineColor(tram) : null;
}

/** Texte lisible sur une couleur de ligne (le jaune de la C demande de l'encre). */
export function lineInk(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) {
    return "#FFFFFF";
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0C0F16" : "#FFFFFF";
}
