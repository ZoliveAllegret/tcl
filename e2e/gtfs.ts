import { crc32, deflateRawSync } from "node:zlib";

/** Zip GTFS minimal, compressé comme le fichier TCL (méthode deflate). */
export function gtfsZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const compressed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(Buffer.concat([local, nameBytes, compressed]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBytes]));
    offset += local.length + nameBytes.length + compressed.length;
  }

  const count = Object.keys(files).length;
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

export const fixtureGtfs = gtfsZip({
  "routes.txt": "route_id,route_short_name,route_long_name\nA,A,Ligne A\nB,B,Ligne B\n",
  "trips.txt": "route_id,trip_id,trip_headsign\nA,t1,Vers Beta\nB,t2,Vers Gamma\n",
  "stop_times.txt":
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
    "t1,08:00:00,08:00:00,1,1\n" +
    "t1,08:06:00,08:06:00,2,2\n" +
    "t2,08:10:00,08:10:00,2,1\n" +
    "t2,08:17:00,08:17:00,3,2\n",
});

export const fixtureStops = [
  { id: 1, nom: "Alpha", commune: "Lyon", adresse: null, lat: 45.76, lon: 4.84, desserte: "A", pmr: true },
  { id: 2, nom: "Beta", commune: "Lyon", adresse: null, lat: 45.74, lon: 4.86, desserte: "A,B", pmr: false },
  { id: 3, nom: "Gamma", commune: "Lyon", adresse: null, lat: 45.72, lon: 4.83, desserte: "B", pmr: true },
];

export function fixturePassages(stopId: number, now: number) {
  const at = (plusMinutes: number) => new Date(now + plusMinutes * 60_000).toISOString();
  if (stopId === 1) {
    return [{ id: 1, ligne: "A", direction: "Vers Beta", delaipassage: "à l'heure", heurepassage: at(3), type: "E", idtarretdestination: 2 }];
  }
  if (stopId === 2) {
    return [{ id: 2, ligne: "B", direction: "Vers Gamma", delaipassage: "à l'heure", heurepassage: at(15), type: "E", idtarretdestination: 3 }];
  }
  return [];
}
