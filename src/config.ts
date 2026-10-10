/**
 * Temps réel et GTFS : compte technique de la plateforme Data Grand Lyon
 * (mot de passe API via « mot de passe oublié » sur data.grandlyon.com, pas GrandLyon Connect seul).
 * Au build : EXPO_PUBLIC_GRANDLYON_USERNAME et EXPO_PUBLIC_GRANDLYON_PASSWORD.
 * Metro n'inline que process.env.EXPO_PUBLIC_* — ces valeurs restent visibles dans la PWA.
 * Le couple demo/demo4dev du doc renvoie désormais 401 : on ne l'envoie plus en Basic Auth.
 */
export const grandLyonConfig = {
  username: process.env.EXPO_PUBLIC_GRANDLYON_USERNAME || "",
  password: process.env.EXPO_PUBLIC_GRANDLYON_PASSWORD || "",
  stopsUrl:
    "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclarret/all.json",
  passagesUrl:
    "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json",
  vehiclesUrl: "https://data.grandlyon.com/siri-lite/2.0/vehicle-monitoring.json",
  disruptionsUrl: "https://data.grandlyon.com/siri-lite/2.0/situation-exchange.json",
  gtfsUrl: "https://download.data.grandlyon.com/files/rdata/tcl_sytral.tcltheorique/GTFS_TCL.ZIP",
  /** Tracés OGC : métro et funiculaire, tramway, bus. */
  lineCollections: {
    metro: "sytral:tcl_sytral.tcllignemf_2_0_0",
    tram: "sytral:tcl_sytral.tcllignetram_2_0_0",
    bus: "sytral:tcl_sytral.tcllignebus_2_0_0",
  },
};

export const LYON_CENTER: { latitude: number; longitude: number } = {
  latitude: 45.7578,
  longitude: 4.832,
};

/** Basic Auth uniquement si un compte API a été fourni au build. */
export function grandLyonFetchHeaders(accept = "application/json"): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (grandLyonConfig.username && grandLyonConfig.password) {
    headers.Authorization = `Basic ${globalThis.btoa(`${grandLyonConfig.username}:${grandLyonConfig.password}`)}`;
  }
  return headers;
}

export function hasGrandLyonApiAccount(): boolean {
  return Boolean(grandLyonConfig.username && grandLyonConfig.password);
}
