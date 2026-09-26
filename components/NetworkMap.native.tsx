import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Text, View } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import { Icon } from "@/components/Icon";
import type { MapVehicle, NetworkMapHandle, NetworkMapProps } from "@/components/mapTypes";
import { lineInk, makeStyles, useTheme } from "@/src/theme";
import type { LatLng } from "@/src/types";

const INITIAL_REGION: Region = {
  latitude: 45.7578,
  longitude: 4.832,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

export const NetworkMap = forwardRef<NetworkMapHandle, NetworkMapProps>(function NetworkMap(
  { stops, vehicles, lines = [], userLocation, selectedVehicleId = null, onSelectStop, onSelectVehicle, onRegionChange },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [trackMarkers, setTrackMarkers] = useState(true);

  const markerKey = vehicles
    .map((vehicle) => `${vehicle.id}:${vehicle.latitude}:${vehicle.longitude}:${vehicle.bearing ?? ""}:${vehicle.mode}`)
    .join("|");

  useEffect(() => {
    setTrackMarkers(true);
    const timer = setTimeout(() => setTrackMarkers(false), 700);
    return () => clearTimeout(timer);
  }, [markerKey, selectedVehicleId, scheme]);

  useImperativeHandle(ref, () => ({
    focusOn(point: LatLng) {
      mapRef.current?.animateToRegion(
        {
          ...point,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        400,
      );
    },
    fitTo(bounds) {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: bounds.south, longitude: bounds.west },
          { latitude: bounds.north, longitude: bounds.east },
        ],
        {
          edgePadding: { top: 90, right: 40, bottom: 170, left: 40 },
          animated: true,
        },
      );
    },
  }));

  useEffect(() => {
    onRegionChange(INITIAL_REGION);
  }, [onRegionChange]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={INITIAL_REGION}
      showsUserLocation={Boolean(userLocation)}
      userInterfaceStyle={scheme}
      mapPadding={{ top: 70, right: 0, bottom: 120, left: 0 }}
      onRegionChangeComplete={onRegionChange}
    >
      {lines.flatMap((line) =>
        line.paths.map((path, index) => (
          <Polyline
            key={`${line.code}-${index}`}
            coordinates={path}
            strokeColor={line.color}
            strokeWidth={5}
          />
        )),
      )}
      {stops.map((stop) => (
        <Marker
          key={`stop-${stop.id}`}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={trackMarkers}
          title={stop.name}
          description={stop.lines.join(" · ")}
          onPress={() => onSelectStop(stop.id)}
        >
          <View
            style={[
              styles.stop,
              stop.color
                ? { borderColor: stop.color, borderWidth: 3, width: 14, height: 14, borderRadius: 7 }
                : { borderColor: scheme === "dark" ? "#8A92A4" : "#5B6275" },
            ]}
          />
        </Marker>
      ))}
      {vehicles.map((vehicle) => (
        <Marker
          key={`vehicle-${vehicle.id}`}
          coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={trackMarkers}
          zIndex={vehicle.id === selectedVehicleId ? 3 : 2}
          onPress={() => onSelectVehicle(vehicle.id)}
        >
          <VehicleTag vehicle={vehicle} ring={colors.surface} selected={vehicle.id === selectedVehicleId} />
        </Marker>
      ))}
    </MapView>
  );
});

/** Étiquette de véhicule : code de ligne dans sa couleur, flèche de cap autour. */
function VehicleTag({ vehicle, ring, selected }: { vehicle: MapVehicle; ring: string; selected: boolean }) {
  const styles = useStyles();
  const ink = lineInk(vehicle.color);
  const radius = vehicle.mode === "metro" ? 12 : vehicle.mode === "tram" ? 8 : 6;
  return (
    <View style={styles.vehicle}>
      <View
        style={[
          styles.tag,
          { backgroundColor: vehicle.color, borderColor: ring, borderRadius: radius },
          selected && styles.selected,
        ]}
      >
        {vehicle.bearing != null ? (
          <View style={{ transform: [{ rotate: `${vehicle.bearing}deg` }] }}>
            <View style={[styles.arrow, { borderBottomColor: ink }]} />
          </View>
        ) : vehicle.mode !== "bus" ? (
          <Icon name={vehicle.mode} color={ink} size={11} />
        ) : null}
        <Text style={[styles.label, { color: ink }]}>{vehicle.line}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  map: {
    flex: 1,
  },
  stop: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: t.colors.surface,
  },
  vehicle: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 24,
    minWidth: 24,
    paddingHorizontal: 7,
    borderWidth: 2,
    shadowColor: "#0C0F16",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  selected: {
    transform: [{ scale: 1.18 }],
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
}));
