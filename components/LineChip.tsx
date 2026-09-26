import { Text, View } from "react-native";

import { NEUTRAL_LINE, lineColor, lineInk, useTheme, vehicleMode } from "@/src/theme";

type LineChipProps = {
  line: string;
  size?: "sm" | "md" | "lg";
  /** Occupe toute la largeur de son bloc, pour une grille de numéros. */
  block?: boolean;
};

const SIZES = {
  sm: { height: 20, font: 11, pad: 6 },
  md: { height: 26, font: 13, pad: 8 },
  lg: { height: 38, font: 17, pad: 11 },
} as const;

/**
 * Pastille de ligne. La forme dit le mode : rond pour le métro,
 * arrondi pour le tramway, rectangle pour le bus.
 */
export function LineChip({ line, size = "md", block = false }: LineChipProps) {
  const { colors, scheme } = useTheme();
  const base = lineColor(line);
  const color = base === NEUTRAL_LINE ? colors.lineNeutral : base;
  const mode = vehicleMode(line);
  const metrics = SIZES[size];
  const height = block ? Math.max(metrics.height, 48) : metrics.height;
  const radius =
    mode === "metro" ? height / 2 : mode === "tram" ? height * 0.32 : height * 0.2;
  return (
    <View
      style={{
        height,
        minWidth: block ? 0 : metrics.height,
        width: block ? "100%" : undefined,
        paddingHorizontal: line.length > 1 ? metrics.pad : 0,
        borderRadius: radius,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: scheme === "dark" && base === NEUTRAL_LINE ? 1 : 0,
        borderColor: "rgba(255, 255, 255, 0.14)",
      }}
      accessibilityLabel={`Ligne ${line}`}
    >
      <Text
        numberOfLines={1}
        style={{
          color: lineInk(color),
          fontSize: block && line.length > 4 ? 14 : metrics.font,
          fontWeight: "800",
          letterSpacing: -0.2,
          fontVariant: ["tabular-nums"],
        }}
      >
        {line}
      </Text>
    </View>
  );
}
