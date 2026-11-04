// Peta live — tile OpenStreetMap via expo-image (jalan di web export +
// dev build; pendekatan sama dengan aplikasi lama, referensi perilaku
// M1). Tile WAJIB memakai header User-Agent pengenal (./osm-tiles):
// tanpa header, OSM mengembalikan tile "Access blocked" 403 — persis
// yang tampil di HP nyata 3 Nov 2026 saat LiveMap masih memakai RN
// Image tanpa header. cacheKey eksplisit berpenanda versi memastikan
// tile blokir yang mungkin ter-cache tidak dipakai lagi.
// Marker warna baku kanban M1; SOS berkedip; medic palang merah.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import type { MemberPosition } from "@/utils/locations-api";
import { osmTileSource } from "@/utils/osm-tiles";
import {
  checkpointMarkerColor,
  type CheckpointKind,
} from "@/utils/route-checkpoint-kind";
import {
  LIVE_MAP_DEFAULT_ZOOM,
  LIVE_MAP_GRID,
  LIVE_MAP_TILE_SIZE,
  LIVE_MAP_MAX_ZOOM,
  LIVE_MAP_MIN_ZOOM,
  liveMapCenterShifted,
  liveMapGrid,
  liveMapPoint,
} from "@/utils/live-map-grid";
import { markerColor } from "@/utils/tracking-logic";
import {
  decorativeAccessibility,
  summaryAccessibility,
} from "@/utils/accessibility";

export interface LiveMapCheckpoint {
  name: string;
  lat: number;
  lon: number;
  kind: CheckpointKind;
}

function MemberMarker({
  position,
  left,
  top,
  hasSos,
}: {
  position: MemberPosition;
  left: number;
  top: number;
  hasSos: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasSos) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: false }),
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, hasSos]);

  const color = markerColor(position.role, hasSos);
  return (
    <Animated.View
      style={[styles.markerWrap, { left, top }, hasSos ? { opacity: blink } : null]}
      {...decorativeAccessibility}
    >
      <View
        style={[
          styles.marker,
          { backgroundColor: color },
          position.role === "MEDIC" && !hasSos ? styles.markerMedic : null,
        ]}
      >
        {position.role === "MEDIC" && !hasSos ? (
          <Text style={styles.cross}>+</Text>
        ) : null}
      </View>
      <Text style={styles.markerLabel}>{position.user.name}</Text>
    </Animated.View>
  );
}

export function LiveMap({
  positions,
  centerLat,
  centerLon,
  sosUserIds,
  accessibilityLabel,
  checkpoints = [],
}: {
  positions: MemberPosition[];
  centerLat: number;
  centerLon: number;
  sosUserIds: ReadonlySet<string>;
  accessibilityLabel: string;
  // Titik checkpoint trip (opsional): selalu tampil meski belum ada
  // posisi anggota — perbaikan 4 Nov 2026 untuk peta tracking dan
  // dashboard leader yang sebelumnya kosong tanpa pin.
  checkpoints?: LiveMapCheckpoint[];
}) {
  const styles = useThemedStyles(makeStyles);
  // Zoom tidak lagi paten 15: tombol +/- menghitung ulang grid tile
  // dan proyeksi semua marker pada zoom yang sama.
  const [zoom, setZoom] = useState(LIVE_MAP_DEFAULT_ZOOM);
  // Skip hitung ulang grid bila center geser < setengah tile (fix GPS
  // kecil tiap 3 dtk): grid lama dipakai, 25 tile tidak reload sia-sia.
  const gridRef = useRef<{ lat: number; lon: number; zoom: number } | null>(
    null,
  );
  const grid = useMemo(() => {
    const prev = gridRef.current;
    if (
      prev &&
      prev.zoom === zoom &&
      !liveMapCenterShifted(prev.lat, prev.lon, centerLat, centerLon, zoom)
    ) {
      return liveMapGrid(prev.lat, prev.lon, prev.zoom);
    }
    gridRef.current = { lat: centerLat, lon: centerLon, zoom };
    return liveMapGrid(centerLat, centerLon, zoom);
  }, [centerLat, centerLon, zoom]);

  const located = positions.filter(
    (p): p is MemberPosition & { location: NonNullable<MemberPosition["location"]> } =>
      p.location !== null,
  );

  return (
    <View
      style={styles.mapbox}
      onLayout={() => {}}
      {...summaryAccessibility(accessibilityLabel)}
    >
      <View style={styles.viewport}>
        <View
          style={{
            position: "absolute",
            width: LIVE_MAP_GRID * LIVE_MAP_TILE_SIZE,
            height: LIVE_MAP_GRID * LIVE_MAP_TILE_SIZE,
            // Pusat trip tepat di tengah viewport (lebar diasumsikan
            // selebar layar; offset dihitung dari pusat piksel dunia).
            left: "50%",
            top: "50%",
            marginLeft: -(grid.centerX - grid.originX),
            marginTop: -(grid.centerY - grid.originY),
          }}
        >
          {grid.tiles.map((tile) => (
            <Image
              key={`${zoom}-${tile.x}-${tile.y}`}
              source={osmTileSource(zoom, tile.x, tile.y)}
              cachePolicy="memory-disk"
              priority="low"
              recyclingKey={`${zoom}-${tile.x}-${tile.y}`}
              style={{
                position: "absolute",
                width: LIVE_MAP_TILE_SIZE,
                height: LIVE_MAP_TILE_SIZE,
                left: tile.left,
                top: tile.top,
              }}
              {...decorativeAccessibility}
            />
          ))}
          {checkpoints.map((cp) => {
            const world = liveMapPoint(cp.lat, cp.lon, zoom);
            return (
              <View
                key={`cp-${cp.name}-${cp.lat}-${cp.lon}`}
                style={[
                  styles.checkpointWrap,
                  {
                    left: world.x - grid.originX,
                    top: world.y - grid.originY,
                  },
                ]}
                {...decorativeAccessibility}
              >
                <View
                  style={[
                    styles.checkpointDot,
                    { backgroundColor: checkpointMarkerColor(cp.kind) },
                  ]}
                />
                <Text style={styles.markerLabel}>{cp.name}</Text>
              </View>
            );
          })}
          {located.map((p) => {
            const world = liveMapPoint(p.location.lat, p.location.lon, zoom);
            return (
              <MemberMarker
                key={p.userId}
                position={p}
                left={world.x - grid.originX}
                top={world.y - grid.originY}
                hasSos={sosUserIds.has(p.userId)}
              />
            );
          })}
        </View>
      </View>
      <View style={styles.zoomBar}>
        <Pressable
          style={({ pressed }) => [
            styles.zoomBtn,
            zoom <= LIVE_MAP_MIN_ZOOM && styles.zoomBtnDisabled,
            pressed && styles.zoomBtnPressed,
          ]}
          disabled={zoom <= LIVE_MAP_MIN_ZOOM}
          onPress={() => setZoom((z) => Math.max(LIVE_MAP_MIN_ZOOM, z - 1))}
        >
          <Text style={styles.zoomBtnText}>−</Text>
        </Pressable>
        <Text style={styles.zoomLabel}>{zoom}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.zoomBtn,
            zoom >= LIVE_MAP_MAX_ZOOM && styles.zoomBtnDisabled,
            pressed && styles.zoomBtnPressed,
          ]}
          disabled={zoom >= LIVE_MAP_MAX_ZOOM}
          onPress={() => setZoom((z) => Math.min(LIVE_MAP_MAX_ZOOM, z + 1))}
        >
          <Text style={styles.zoomBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const MAP_HEIGHT = 300;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  // .mapbox
  mapbox: {
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.line,
    marginTop: 12,
    backgroundColor: "#e9efe2",
    ...shadowCard,
  },
  viewport: { height: MAP_HEIGHT, overflow: "hidden" },
  checkpointWrap: { position: "absolute", alignItems: "center", marginLeft: -7, marginTop: -7 },
  checkpointDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },
  zoomBar: { position: "absolute", right: 8, top: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,.9)", borderRadius: 8, padding: 4 },
  zoomBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#108b93", alignItems: "center", justifyContent: "center" },
  zoomBtnPressed: { opacity: 0.7 },
  zoomBtnDisabled: { opacity: 0.4 },
  zoomBtnText: { color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 20 },
  zoomLabel: { fontSize: 12, fontWeight: "800", minWidth: 16, textAlign: "center" },
  markerWrap: { position: "absolute", alignItems: "center", marginLeft: -9, marginTop: -9 },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  markerMedic: { borderColor: "#c3cec0", borderWidth: 1.6 },
  cross: { color: "#dc2626", fontSize: 11, fontWeight: "800", lineHeight: 13 },
  markerLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: c.text,
    backgroundColor: "rgba(255,255,255,.75)",
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
});
