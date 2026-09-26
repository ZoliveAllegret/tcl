/**
 * Compte de démonstration documenté par le portail data.grandlyon.com.
 * Un compte personnel se passe au build, sans le committer :
 * EXPO_PUBLIC_GRANDLYON_USERNAME et EXPO_PUBLIC_GRANDLYON_PASSWORD.
 * L'accès doit rester statique : Metro n'inline que process.env.EXPO_PUBLIC_*.
 * Ces valeurs restent visibles dans le JavaScript de la PWA.
 */
export const grandLyonConfig = {
  username: process.env.EXPO_PUBLIC_GRANDLYON_USERNAME || "demo",
  password: process.env.EXPO_PUBLIC_GRANDLYON_PASSWORD || "demo4dev",
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
