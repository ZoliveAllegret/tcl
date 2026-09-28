import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { makeStyles, useTheme } from "@/src/theme";

/* ------------------------------------------------------------------ */
/* Marque                                                              */
/* ------------------------------------------------------------------ */

const LOGO = require("@/assets/images/logo.png");

/** Logo Transports Lyon. */
export function BrandMark({ size = 112 }: { size?: number }) {
  return (
    <Image
      source={LOGO}
      accessibilityLabel="Transports Lyon"
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* En-tête d'écran                                                     */
/* ------------------------------------------------------------------ */

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
};

/** Marge haute. Dans Safari, l'encoche est déjà hors de la page : la réajouter décale tout l'écran. */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return insets.top;
  }
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? insets.top : 0;
}

export function ScreenHeader({ title, subtitle, right, children }: ScreenHeaderProps) {
  const styles = useHeaderStyles();
  const topInset = useTopInset();
  return (
    <View style={[styles.header, { paddingTop: topInset + 10 }]}>
      <View style={styles.brandRow}>
        <BrandMark />
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            {right}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const useHeaderStyles = makeStyles((t) => ({
  header: {
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.md,
    gap: t.space.lg,
    backgroundColor: t.colors.background,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
    minHeight: 112,
  },
  titleBlock: {
    flex: 1,
    justifyContent: "center",
    gap: t.space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.space.sm,
  },
  title: {
    ...t.type.display,
    flexShrink: 1,
    color: t.colors.ink,
  },
  subtitle: {
    ...t.type.callout,
    color: t.colors.muted,
  },
}));

/* ------------------------------------------------------------------ */
/* Champ de recherche                                                  */
/* ------------------------------------------------------------------ */

type SearchFieldProps = Omit<TextInputProps, "style"> & {
  value: string;
  onChangeText: (value: string) => void;
  inputRef?: React.Ref<TextInput>;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  floating?: boolean;
};

export function SearchField({
  value,
  onChangeText,
  inputRef,
  icon = "search",
  style,
  floating,
  ...props
}: SearchFieldProps) {
  const styles = useFieldStyles();
  const t = useTheme();
  return (
    <View style={[styles.field, floating && [styles.floating, t.floating], style]}>
      <Icon name={icon} color={t.colors.muted} size={20} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={t.colors.muted}
        autoCorrect={false}
        style={styles.input}
        selectionColor={t.colors.accent}
        keyboardAppearance={t.scheme}
        returnKeyType="search"
        {...props}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel="Effacer"
        >
          <Icon name="close" color={t.colors.surface} size={13} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useFieldStyles = makeStyles((t) => ({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: t.space.md + 2,
    height: 52,
  },
  floating: {
    borderColor: "transparent",
  },
  input: {
    flex: 1,
    height: "100%",
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "500",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
}));

/* ------------------------------------------------------------------ */
/* Titres de section, pastilles, boutons                               */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  const styles = useSectionStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{children}</Text>
      {trailing}
    </View>
  );
}

const useSectionStyles = makeStyles((t) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: t.space.lg,
    paddingBottom: t.space.sm + 2,
    backgroundColor: t.colors.background,
  },
  label: {
    ...t.type.overline,
    color: t.colors.muted,
  },
}));

/** Point vert qui pulse : signale une donnée en temps réel. */
export function LiveDot({ color, size = 8 }: { color?: string; size?: number }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: Platform.OS !== "web" }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const tint = color ?? t.colors.live;
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size * 2,
          height: size * 2,
          borderRadius: size,
          backgroundColor: tint,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint }} />
    </View>
  );
}

type BadgeTone = "live" | "scheduled" | "neutral" | "accent";

export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: IconName; children: ReactNode }) {
  const t = useTheme();
  const tones: Record<BadgeTone, [string, string]> = {
    live: [t.colors.liveSoft, t.colors.live],
    scheduled: [t.colors.scheduledSoft, t.colors.scheduled],
    neutral: [t.colors.surfaceMuted, t.colors.inkSoft],
    accent: [t.colors.accentSoft, t.colors.accent],
  };
  const [background, ink] = tones[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 5,
        backgroundColor: background,
        borderRadius: t.radius.pill,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}
    >
      {icon ? <Icon name={icon} color={ink} size={13} /> : null}
      <Text style={{ color: ink, fontSize: 12, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  variant?: "surface" | "ink";
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon, label, onPress, active, variant = "surface", size = 44, style }: IconButtonProps) {
  const t = useTheme();
  const background = active ? t.colors.accent : variant === "ink" ? t.colors.ink : t.colors.surface;
  const ink = active ? t.colors.accentInk : variant === "ink" ? t.colors.background : t.colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <Icon name={icon} color={ink} size={Math.round(size * 0.45)} />
    </Pressable>
  );
}

export function Button({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.sm,
        backgroundColor: t.colors.accent,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.xl,
        paddingVertical: t.space.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Icon name={icon} color={t.colors.accentInk} size={18} /> : null}
      <Text style={{ color: t.colors.accentInk, fontSize: 16, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* États vides, chargement, erreur                                     */
/* ------------------------------------------------------------------ */

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
  tone?: "neutral" | "danger";
};

export function EmptyState({ icon, title, message, action, tone = "neutral" }: EmptyStateProps) {
  const styles = useEmptyStyles();
  const t = useTheme();
  const danger = tone === "danger";
  return (
    <View style={styles.wrap}>
      <View style={[styles.halo, danger && { backgroundColor: t.colors.dangerSoft }]}>
        <Icon name={icon} color={danger ? t.colors.danger : t.colors.muted} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action}
    </View>
  );
}

const useEmptyStyles = makeStyles((t) => ({
  wrap: {
    alignItems: "center",
    paddingVertical: t.space.xxxl,
    paddingHorizontal: t.space.xl,
    gap: t.space.sm,
  },
  halo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: t.space.sm,
  },
  title: {
    ...t.type.headline,
    color: t.colors.ink,
    textAlign: "center",
  },
  message: {
    ...t.type.callout,
    color: t.colors.muted,
    textAlign: "center",
    maxWidth: 300,
    marginBottom: t.space.sm,
  },
}));

/** Squelette de chargement pour les listes. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ gap: t.space.sm + 2, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{ height: 84, borderRadius: t.radius.lg, backgroundColor: t.colors.surfaceMuted }}
        />
      ))}
    </Animated.View>
  );
}
