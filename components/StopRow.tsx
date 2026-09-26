import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { LineChip } from "@/components/LineChip";
import { usePlaceName } from "@/src/stops/placeName";
import { makeStyles, useTheme, vehicleMode } from "@/src/theme";
import type { Stop } from "@/src/types";

type StopRowProps = {
  stop: Stop;
  detail?: string;
  lookupPlace?: boolean;
  onPress: (stop: Stop) => void;
};

const MAX_LINES = 5;

export function StopRow({ stop, detail, lookupPlace = true, onPress }: StopRowProps) {
  const styles = useStyles();
  const t = useTheme();
  const placeName = usePlaceName(lookupPlace ? stop : undefined);
  const lines = stop.lines.slice(0, MAX_LINES);
  const extra = stop.lines.length - lines.length;
  const place = placeName || stop.commune;
  const mode = stop.lines.some((line) => vehicleMode(line) === "metro")
    ? "metro"
    : stop.lines.some((line) => vehicleMode(line) === "tram")
      ? "tram"
      : "bus";

  return (
    <Pressable
      onPress={() => onPress(stop)}
      style={({ pressed }) => [styles.row, t.elevation, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${stop.name}, ${place}${detail ? `, à ${detail}` : ""}`}
    >
      <View style={styles.glyph}>
        <Icon name={mode} color={t.colors.inkSoft} size={20} />
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {stop.name}
          </Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {place}
          </Text>
          {stop.wheelchair ? <Icon name="accessible" color={t.colors.muted} size={14} /> : null}
        </View>
        <View style={styles.lines}>
          {lines.map((line) => (
            <LineChip key={line} line={line} size="sm" />
          ))}
          {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
        </View>
      </View>
      <Icon name="chevron" color={t.colors.muted} size={18} style={styles.chevron} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: t.space.md,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.space.md + 2,
    marginBottom: t.space.sm + 2,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  pressed: {
    backgroundColor: t.colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: t.radius.sm + 2,
    backgroundColor: t.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 3,
  },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: t.space.sm,
  },
  name: {
    ...t.type.bodyStrong,
    flex: 1,
    color: t.colors.ink,
  },
  detail: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.accent,
    fontVariant: ["tabular-nums"],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.xs + 2,
  },
  meta: {
    ...t.type.caption,
    color: t.colors.muted,
    flexShrink: 1,
  },
  lines: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
    marginTop: t.space.xs + 2,
  },
  extra: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.muted,
  },
  chevron: {
    alignSelf: "center",
  },
}));
