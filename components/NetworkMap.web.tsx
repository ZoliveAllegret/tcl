import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { NetworkMapHandle, NetworkMapProps } from "@/components/mapTypes";
import { useTheme } from "@/src/theme";
import type { LatLng, MapRegion } from "@/src/types";

const MAP_DOCUMENT = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; height: 100%; background: #E8EAF0; }
    body.dark, body.dark #map { background: #10131A; }
    @media (prefers-color-scheme: dark) { html, body, #map { background: #10131A; } }
    body.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.6); }
    .leaflet-top.leaflet-right { top: 50%; transform: translateY(-50%); }
    .leaflet-control-zoom { border: 0 !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,.16) !important; }
    .leaflet-control-zoom a { width: 40px !important; height: 40px !important; line-height: 40px !important; font: 600 20px/40px system-ui, sans-serif !important; color: #0C0F16 !important; }
    body.dark .leaflet-control-zoom a { background: #1D222D !important; color: #F2F4F8 !important; border-color: #232937 !important; }
    body.dark .leaflet-control-attribution { background: rgba(19, 23, 32, 0.8) !important; color: #8A92A4; }
    body.dark .leaflet-control-attribution a { color: #8E88FF; }
    .leaflet-tooltip { border: 0; border-radius: 10px; font: 700 12px system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
    .veh { position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
    .veh .tag {
      position: relative; display: flex; align-items: center; gap: 3px;
      height: 24px; min-width: 24px; padding: 0 7px; box-sizing: border-box; justify-content: center;
      background: var(--c); color: var(--ink); border: 2px solid var(--ring);
      font: 800 11px/1 system-ui, -apple-system, sans-serif; letter-spacing: -0.2px;
      box-shadow: 0 2px 8px rgba(12, 15, 22, 0.28);
    }
    .veh .tag svg { width: 12px; height: 12px; flex: none; }
    .veh .tag .dir { display: block; width: 11px; height: 11px; flex: none; transition: transform .6s ease; }
    .leaflet-bottom.leaflet-right { bottom: 176px; }
    .leaflet-control-attribution { font-size: 10px; border-radius: 8px 0 0 8px; }
    .veh.metro .tag { border-radius: 999px; }
    .veh.tram .tag { border-radius: 8px; }
    .veh.bus .tag { border-radius: 6px; }
    .veh.selected .tag { transform: scale(1.18); box-shadow: 0 0 0 4px rgba(59, 52, 240, 0.28), 0 4px 12px rgba(12, 15, 22, 0.3); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: false }).setView([45.7578, 4.832], 13);
    L.control.zoom({ position: 'topright' }).addTo(map);
    let palette = { accent: '#3B34F0', surface: '#FFFFFF', ink: '#0C0F16', user: '#2F6FE4', stop: '#5B6275' };
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const linesLayer = L.layerGroup().addTo(map);
    const stopsLayer = L.layerGroup().addTo(map);
    const vehiclesLayer = L.layerGroup().addTo(map);
    const userLayer = L.layerGroup().addTo(map);
    const vehicleMotions = new Map();
    const SLIDE_MS = 10000;
    let linesSignature = '';

    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));

    function travelHeading(fromLat, fromLng, toLat, toLng, bearing) {
      const dLat = toLat - fromLat;
      const dLng = toLng - fromLng;
      if (Math.abs(dLat) > 0.00002 || Math.abs(dLng) > 0.00002) {
        return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
      }
      return typeof bearing === "number" && !Number.isNaN(bearing) ? bearing : null;
    }

    const MODE_GLYPH = {
      metro: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 2.5 5 6v9.5A3.5 3.5 0 0 0 8.5 19L7 20.5v.5h2l2-2h2l2 2h2v-.5L15.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-3-4-7-4zm-3.5 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM17 11H7V6h10v5z"/></svg>',
      tram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 5l.75-1.5H17V2H7v1.5h4.75L11 5c-3.13.09-6 .73-6 3.5V17c0 1.5 1.11 2.73 2.55 2.95L6 21.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 20h-.08c1.69 0 2.58-1.37 2.58-3V8.5c0-2.77-2.86-3.41-6-3.5zm-1 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5-4.5H7V9h10v5z"/></svg>',
      bus: ''
    };

    function inkOn(color) {
      const hex = String(color).replace('#', '');
      if (hex.length !== 6) return '#fff';
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0C0F16' : '#FFFFFF';
    }

    let selectedVehicle = null;

    function vehicleHtml(mode, color, line, heading, id) {
      const kind = mode === "tram" || mode === "metro" ? mode : "bus";
      const lead = heading == null
        ? MODE_GLYPH[kind]
        : '<svg class="dir" viewBox="0 0 12 12" style="transform:rotate(' + Math.round(heading) + 'deg)">' +
          '<path d="M6 0.5 L11 11 L6 8.4 L1 11 Z" fill="currentColor"/></svg>';
      return '<div class="veh ' + kind + (id === selectedVehicle ? ' selected' : '') +
        '" style="--c:' + color + ';--ink:' + inkOn(color) + ';--ring:' + palette.surface + '">' +
        '<div class="tag">' + lead + '<span>' + line + '</span></div></div>';
    }

    function vehicleIcon(mode, color, line, heading, id) {
      return L.divIcon({
        className: '',
        html: vehicleHtml(mode, color, line, heading, id),
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });
    }

    function syncVehicles(vehicles) {
      const seen = new Set();
      const now = performance.now();
      (vehicles || []).forEach((vehicle) => {
        seen.add(vehicle.id);
        const nextLat = Number(vehicle.latitude);
        const nextLng = Number(vehicle.longitude);
        const color = escapeHtml(vehicle.color);
        const line = escapeHtml(vehicle.line);
        const mode = vehicle.mode === "tram" || vehicle.mode === "metro" ? vehicle.mode : "bus";
        const current = vehicleMotions.get(vehicle.id);
        if (!current) {
          const heading = typeof vehicle.bearing === "number" ? vehicle.bearing : null;
          const marker = L.marker([nextLat, nextLng], { icon: vehicleIcon(mode, color, line, heading, vehicle.id), zIndexOffset: 1000 });
          marker.on('click', () => {
            selectedVehicle = vehicle.id;
            parent.postMessage({ source: 'tcl-map', type: 'vehicle', id: vehicle.id }, '*');
          });
          marker.addTo(vehiclesLayer);
          vehicleMotions.set(vehicle.id, {
            marker, fromLat: nextLat, fromLng: nextLng, toLat: nextLat, toLng: nextLng,
            start: now, duration: 1, signature: mode + '|' + color + '|' + line + '|' + heading + '|' + (vehicle.id === selectedVehicle)
          });
          return;
        }
        const place = current.marker.getLatLng();
        const dLat = nextLat - place.lat;
        const dLng = nextLng - place.lng;
        const moved = Math.abs(dLat) > 0.00001 || Math.abs(dLng) > 0.00001;
        const jump = Math.abs(dLat) > 0.02 || Math.abs(dLng) > 0.02;
        const heading = travelHeading(place.lat, place.lng, nextLat, nextLng, vehicle.bearing);
        const signature = mode + '|' + color + '|' + line + '|' + (heading == null ? '' : Math.round(heading)) + '|' + (vehicle.id === selectedVehicle);
        if (current.signature !== signature) {
          current.signature = signature;
          current.marker.setIcon(vehicleIcon(mode, color, line, heading, vehicle.id));
        }
        current.fromLat = place.lat;
        current.fromLng = place.lng;
        current.toLat = nextLat;
        current.toLng = nextLng;
        current.start = now;
        current.duration = moved && !jump ? SLIDE_MS : 1;
      });
      vehicleMotions.forEach((motion, id) => {
        if (seen.has(id)) return;
        vehiclesLayer.removeLayer(motion.marker);
        vehicleMotions.delete(id);
      });
    }

    function slideVehicles(now) {
      vehicleMotions.forEach((motion) => {
        if (motion.duration <= 0) return;
        const progress = Math.min(1, (now - motion.start) / motion.duration);
        motion.marker.setLatLng([
          motion.fromLat + (motion.toLat - motion.fromLat) * progress,
          motion.fromLng + (motion.toLng - motion.fromLng) * progress
        ]);
        if (progress >= 1) motion.duration = 0;
      });
      requestAnimationFrame(slideVehicles);
    }
    requestAnimationFrame(slideVehicles);

    let lastStops = [];

    function stopRadius() {
      const zoom = map.getZoom();
      return zoom >= 17 ? 7 : zoom >= 16 ? 6 : zoom >= 15 ? 5 : zoom >= 14 ? 4 : 3;
    }

    function drawStops() {
      stopsLayer.clearLayers();
      const radius = stopRadius();
      lastStops.forEach((stop) => {
        const strong = Boolean(stop.color);
        const marker = L.circleMarker([stop.latitude, stop.longitude], {
          radius: strong ? radius + 1 : radius,
          color: strong ? stop.color : palette.stop,
          weight: strong ? 3 : 2,
          fillColor: palette.surface,
          fillOpacity: 1,
          bubblingMouseEvents: false
        });
        marker.bindTooltip(escapeHtml(stop.name), { direction: 'top', offset: [0, -radius - 2] });
        marker.on('click', () => parent.postMessage({ source: 'tcl-map', type: 'stop', id: stop.id }, '*'));
        marker.addTo(stopsLayer);
      });
    }

    map.on('zoomend', drawStops);

    function publishRegion() {
      const bounds = map.getBounds();
      const center = map.getCenter();
      parent.postMessage({
        source: 'tcl-map',
        type: 'region',
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: bounds.getNorth() - bounds.getSouth(),
        longitudeDelta: bounds.getEast() - bounds.getWest()
      }, '*');
    }

    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'tcl-theme') {
        palette = Object.assign(palette, data.palette || {});
        document.body.classList.toggle('dark', data.scheme === 'dark');
        // Le parent peut s'abonner après le premier « moveend » : on lui renvoie la zone visible.
        publishRegion();
        drawStops();
        return;
      }
      if (data.type === 'tcl-focus') {
        map.setView([data.latitude, data.longitude], 15);
        return;
      }
      if (data.type === 'tcl-fit') {
        map.fitBounds([[data.south, data.west], [data.north, data.east]], { padding: [56, 56] });
        return;
      }
      if (data.type !== 'tcl-data') return;
      syncLines(data.lines);
      stopsLayer.clearLayers();
      userLayer.clearLayers();
      if (typeof data.selectedVehicle !== 'undefined') selectedVehicle = data.selectedVehicle;
      lastStops = data.stops || [];
      drawStops();
      syncVehicles(data.vehicles);
      if (data.userLocation) {
        L.circleMarker([data.userLocation.latitude, data.userLocation.longitude], {
          radius: 8, color: palette.surface, weight: 3, fillColor: palette.user, fillOpacity: 1
        }).addTo(userLayer);
      }
    });

    function syncLines(lines) {
      const signature = (lines || []).map((line) => line.code + ':' + line.color + ':' +
        (line.paths || []).reduce((count, path) => count + path.length, 0)).join('|');
      if (signature === linesSignature) return;
      linesSignature = signature;
      linesLayer.clearLayers();
      (lines || []).forEach((line) => {
        (line.paths || []).forEach((path) => {
          const latLngs = path.map((point) => [point.latitude, point.longitude]);
          if (latLngs.length < 2) return;
          L.polyline(latLngs, { color: line.color, weight: 5, opacity: 0.9 }).addTo(linesLayer);
        });
      });
      linesLayer.bringToBack();
    }

    map.on('moveend', publishRegion);
    map.whenReady(publishRegion);
  </script>
</body>
</html>`;

export const NetworkMap = forwardRef<NetworkMapHandle, NetworkMapProps>(function NetworkMap(
  { stops, vehicles, lines = [], userLocation, selectedVehicleId = null, onSelectStop, onSelectVehicle, onRegionChange },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { scheme, colors } = useTheme();
  const onSelectStopRef = useRef(onSelectStop);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const onRegionChangeRef = useRef(onRegionChange);
  onSelectStopRef.current = onSelectStop;
  onSelectVehicleRef.current = onSelectVehicle;
  onRegionChangeRef.current = onRegionChange;

  useImperativeHandle(ref, () => ({
    focusOn(point: LatLng) {
      frameRef.current?.contentWindow?.postMessage({ type: "tcl-focus", ...point }, "*");
    },
    fitTo(bounds) {
      frameRef.current?.contentWindow?.postMessage({ type: "tcl-fit", ...bounds }, "*");
    },
  }));

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as { source?: string; type?: string; id?: number | string } & Partial<MapRegion>;
      if (data?.source !== "tcl-map") {
        return;
      }
      if (data.type === "region") {
        onRegionChangeRef.current({
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          latitudeDelta: Number(data.latitudeDelta),
          longitudeDelta: Number(data.longitudeDelta),
        });
      } else if (data.type === "stop" && typeof data.id === "number") {
        onSelectStopRef.current(data.id);
      } else if (data.type === "vehicle" && typeof data.id === "string") {
        onSelectVehicleRef.current(data.id);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const postTheme = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "tcl-theme",
        scheme,
        palette: {
          accent: colors.accent,
          surface: colors.surface,
          ink: colors.ink,
          user: "#2F6FE4",
          stop: scheme === "dark" ? "#8A92A4" : "#5B6275",
        },
      },
      "*",
    );
  }, [colors, scheme]);

  const postData = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "tcl-data",
        stops,
        vehicles,
        lines,
        userLocation,
        selectedVehicle: selectedVehicleId,
      },
      "*",
    );
  }, [stops, vehicles, lines, userLocation, selectedVehicleId]);

  useEffect(() => {
    postTheme();
    postData();
  }, [postTheme, postData]);

  return (
    <View style={styles.fill}>
      {createElement("iframe", {
        ref: frameRef,
        title: "Carte TCL",
        srcDoc: MAP_DOCUMENT,
        onLoad: () => {
          postTheme();
          postData();
        },
        style: { border: 0, width: "100%", height: "100%", background: colors.surfaceMuted },
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
