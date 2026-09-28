import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, SectionList, Text, TextInput, useWindowDimensions, View } from "react-native";

import { Icon } from "@/components/Icon";
import { LineChip } from "@/components/LineChip";
import { useNavBarInset } from "@/components/NavBar";
import { EmptyState, ProgressMeter, ScreenHeader, SearchField, SectionLabel, SkeletonRows } from "@/components/ui";
import { useDisruptionCounts } from "@/src/hooks/useDisruptionCounts";
import { collectLines, sectionLines, type LineSummary } from "@/src/lines/groupLines";
import { getLineName, loadLineNames } from "@/src/schedule/theoretical";
import { searchTarget, searchToken, subscribeSearch } from "@/src/search/session";
import { useStops } from "@/src/stops/StopsProvider";
import { makeStyles, useTheme } from "@/src/theme";

export default function LinesScreen() {
  const styles = useStyles();
  const { stops, loading, loadedCount, totalCount } = useStops();
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const { width } = useWindowDimensions();
  const columns = width >= 520 ? 4 : 3;
  const inputRef = useRef<TextInput>(null);
  const token = useSyncExternalStore(subscribeSearch, searchToken, searchToken);
  const navInset = useNavBarInset();
  const [namesReady, setNamesReady] = useState(false);
  const disruptions = useDisruptionCounts();
  const lines = useMemo(() => collectLines(stops), [stops]);
  const sections = useMemo(() => sectionLines(lines, query, getLineName), [lines, query, namesReady]);
  const listSections = useMemo(() => {
    if (!compact) {
      return sections.map((section) => ({
        title: section.title,
        data: section.data.map((line): LineListItem => ({ kind: "line", id: line.code, line })),
      }));
    }
    return sections.map((section) => ({
      title: section.title,
      data: chunk(section.data, columns).map(
        (row): LineListItem => ({
          kind: "grid",
          id: row.map((line) => line.code).join("-"),
          lines: row,
        }),
      ),
    }));
  }, [columns, compact, sections]);

  useEffect(() => {
    if (token === 0 || searchTarget() !== "lines") {
      return;
    }
    setQuery("");
    inputRef.current?.focus();
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void loadLineNames()
      .then(() => {
        if (!cancelled) {
          setNamesReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNamesReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <SectionList
        key={compact ? `grid-${columns}` : "list"}
        sections={listSections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: navInset }]}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <ScreenHeader
            title="Lignes"
            subtitle={
              loading
                ? "Chargement du réseau…"
                : namesReady
                  ? `${lines.length} lignes · métro, tram, bus`
                  : `${lines.length} lignes · noms en cours de chargement`
            }
          >
            <SearchField
              inputRef={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Numéro de ligne : 121, T1, C3…"
              autoCapitalize="characters"
            />
            <View style={styles.switch} accessibilityRole="tablist">
              <Pressable
                onPress={() => setCompact(false)}
                accessibilityRole="tab"
                accessibilityState={{ selected: !compact }}
                style={[styles.switchItem, !compact && styles.switchOn]}
              >
                <Text style={[styles.switchLabel, !compact && styles.switchLabelOn]}>Détail</Text>
              </Pressable>
              <Pressable
                onPress={() => setCompact(true)}
                accessibilityRole="tab"
                accessibilityState={{ selected: compact }}
                style={[styles.switchItem, compact && styles.switchOn]}
              >
                <Text style={[styles.switchLabel, compact && styles.switchLabelOn]}>Numéros</Text>
              </Pressable>
            </View>
          </ScreenHeader>
        }
        ListEmptyComponent={
          <View style={styles.inset}>
            {loading ? (
              <View style={{ gap: 12 }}>
                <ProgressMeter label="Chargement des arrêts" percent={totalCount ? (loadedCount / totalCount) * 100 : 0} />
                <SkeletonRows count={6} />
              </View>
            ) : (
              <EmptyState icon="empty" title="Aucune ligne" message="Vérifiez le numéro saisi." />
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.inset}>
            <SectionLabel>{section.title}</SectionLabel>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.inset}>
            {item.kind === "line" ? (
              <LineRow
                line={item.line}
                named={namesReady}
                disruptions={disruptions[item.line.code] ?? 0}
                onPress={() => openLine(item.line.code)}
              />
            ) : (
              <View style={styles.grid}>
                {item.lines.map((line) => (
                  <Pressable
                    key={line.code}
                    onPress={() => openLine(line.code)}
                    accessibilityRole="button"
                    accessibilityLabel={disruptionLabel(line.code, disruptions[line.code] ?? 0)}
                    style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
                  >
                    <View style={styles.tile}>
                      <LineChip line={line.code} size="md" block />
                      {(disruptions[line.code] ?? 0) > 0 ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{disruptions[line.code]}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
                {Array.from({ length: columns - item.lines.length }, (_, index) => (
                  <View key={`pad-${item.id}-${index}`} style={styles.gridCell} />
                ))}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

type LineListItem =
  | { kind: "line"; id: string; line: LineSummary }
  | { kind: "grid"; id: string; lines: LineSummary[] };

function openLine(code: string) {
  router.push({ pathname: "/line/[code]", params: { code } });
}

function disruptionPhrase(count: number): string {
  return count > 1 ? `${count} perturbations` : `${count} perturbation`;
}

function disruptionLabel(code: string, count: number): string {
  return count > 0 ? `Ligne ${code}, ${disruptionPhrase(count)}` : `Ligne ${code}`;
}

function LineRow({
  line,
  named,
  disruptions,
  onPress,
}: {
  line: LineSummary;
  named: boolean;
  disruptions: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const t = useTheme();
  const label = named ? getLineName(line.code) : undefined;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, t.elevation, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        label ? `${disruptionLabel(line.code, disruptions)}, ${label}` : disruptionLabel(line.code, disruptions)
      }
    >
      <View style={styles.chip}>
        <LineChip line={line.code} size="lg" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>
          {label ?? `Ligne ${line.code}`}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {line.stopCount} {line.stopCount > 1 ? "arrêts" : "arrêt"}
        </Text>
        {disruptions > 0 ? <Text style={styles.alert}>{disruptionPhrase(disruptions)}</Text> : null}
      </View>
      <Icon name="chevron" color={t.colors.muted} size={18} />
    </Pressable>
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
    backgroundColor: t.colors.background,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.md,
    marginBottom: t.space.sm,
    borderWidth: t.scheme === "dark" ? 1 : 0,
    borderColor: t.colors.border,
  },
  pressed: {
    backgroundColor: t.colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  chip: {
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: t.colors.ink,
  },
  meta: {
    ...t.type.caption,
    color: t.colors.muted,
  },
  alert: {
    ...t.type.caption,
    fontWeight: "700",
    color: t.colors.danger,
  },
  tile: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: t.colors.danger,
    borderWidth: 2,
    borderColor: t.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
  },
  switch: {
    flexDirection: "row",
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.pill,
    padding: 3,
    gap: 3,
  },
  switchItem: {
    flex: 1,
    alignItems: "center",
    borderRadius: t.radius.pill,
    paddingVertical: 8,
  },
  switchOn: {
    backgroundColor: t.colors.surface,
  },
  switchLabel: {
    ...t.type.callout,
    fontWeight: "700",
    color: t.colors.muted,
  },
  switchLabelOn: {
    color: t.colors.ink,
  },
  grid: {
    flexDirection: "row",
    gap: t.space.sm,
    marginBottom: t.space.sm,
    paddingTop: 6,
  },
  gridCell: {
    flex: 1,
  },
}));
