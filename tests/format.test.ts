import { formatClock, formatSiriDelay, lineFromSiriRef, normalizeText, parseLines, stopIdFromSiriRef } from "@/src/format";

test("normalizeText retire accents et casse", () => {
  expect(normalizeText("  Hôtel de Ville  ")).toBe("hotel de ville");
});

test("parseLines lit les codes avant les deux-points", () => {
  expect(parseLines("B:métro,C8:bus, B:doublon")).toEqual(["B", "C8"]);
  expect(parseLines(null)).toEqual([]);
});

test("formatClock accepte une heure ISO ou HH:MM", () => {
  expect(formatClock("2026-09-26T14:05:00")).toMatch(/14:05/);
  expect(formatClock("08:07:00")).toBe("08:07");
  expect(formatClock(null)).toBe("");
});

test("formatSiriDelay arrondit à la minute", () => {
  expect(formatSiriDelay("PT30S")).toBe("à l'heure");
  expect(formatSiriDelay("PT45S")).toBe("+1 min");
  expect(formatSiriDelay("PT3M")).toBe("+3 min");
  expect(formatSiriDelay("-PT2M")).toBe("2 min d'avance");
  expect(formatSiriDelay("demain")).toBeNull();
});

test("les références SIRI donnent la ligne et l'arrêt", () => {
  expect(lineFromSiriRef("ActIV:Line::C8:SYTRAL")).toBe("C8");
  expect(lineFromSiriRef(null)).toBe("?");
  expect(stopIdFromSiriRef("ActIV:StopPoint:Q:46022:SYTRAL")).toBe(46022);
  expect(stopIdFromSiriRef("sans-chiffre")).toBeNull();
});
