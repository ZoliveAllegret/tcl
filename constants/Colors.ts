import { palettes } from "@/src/theme";

/** Conservé pour compatibilité avec le gabarit Expo : les couleurs viennent de src/theme.ts. */
export default {
  light: {
    text: palettes.light.ink,
    background: palettes.light.background,
    tint: palettes.light.accent,
    tabIconDefault: palettes.light.muted,
    tabIconSelected: palettes.light.accent,
  },
  dark: {
    text: palettes.dark.ink,
    background: palettes.dark.background,
    tint: palettes.dark.accent,
    tabIconDefault: palettes.dark.muted,
    tabIconSelected: palettes.dark.accent,
  },
};
