import { writeFileSync } from "node:fs";

import { grandLyonConfig } from "../src/config.ts";
import { forEachDataLine, inflateText, readZipEntries } from "../src/schedule/gtfsZip.ts";
import { collectRideLinks, packRideGraph, sameRideGraph, unpackRideGraph } from "../src/schedule/rideGraph.ts";

const target = new URL("../public/ride-graph.json", import.meta.url);

const response = await fetch(grandLyonConfig.gtfsUrl, {
  headers: {
    Authorization: `Basic ${Buffer.from(`${grandLyonConfig.username}:${grandLyonConfig.password}`).toString("base64")}`,
  },
});
if (!response.ok) {
  throw new Error(`Les horaires théoriques ont répondu ${response.status}.`);
}

const entries = readZipEntries(await response.arrayBuffer());
const routes = entries.get("routes.txt");
const trips = entries.get("trips.txt");
const stopTimes = entries.get("stop_times.txt");
if (!routes || !trips || !stopTimes) {
  throw new Error("Le réseau théorique TCL est incomplet.");
}

const graph = await collectRideLinks(await inflateText(routes), await inflateText(trips), (onLine) =>
  forEachDataLine(stopTimes, onLine),
);
const packed = packRideGraph(graph);
if (!sameRideGraph(graph, unpackRideGraph(packed))) {
  throw new Error("Le réseau préparé ne reproduit pas le calcul actuel. Fichier non écrit.");
}

const edges = [...graph.values()].reduce((total, links) => total + links.length, 0);
if (graph.size < 1000 || edges < 10_000) {
  throw new Error(`Réseau trop petit pour être fiable (${graph.size} arrêts, ${edges} liaisons). Fichier non écrit.`);
}

const body = JSON.stringify(packed);
writeFileSync(target, body);
console.log(
  `${graph.size} arrêts, ${edges} liaisons, ${packed.lines.length} lignes, ${Math.round(Buffer.byteLength(body) / 1024)} Ko`,
);
