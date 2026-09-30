import { Map as MapLibreMap, NavigationControl, Popup, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { MapMode, Theme, Uf } from "../types";
import { formatPct } from "../lib/format";
import type { RegionRow } from "../lib/metrics";

const LIGHT = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK = LIGHT;

interface Point {
  lon: number;
  lat: number;
  w: number;
  name: string;
}

export function MapPanel({
  uf,
  theme,
  mode,
  regions,
  geo,
  points,
  selectedKey,
  metricLabel,
  onSelect,
}: {
  uf: Uf;
  theme: Theme;
  mode: MapMode;
  regions: RegionRow[];
  geo: GeoJSON.FeatureCollection | null;
  points: Point[];
  selectedKey: string | null;
  metricLabel: string;
  onSelect: (key: string | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelect);
  const themeRef = useRef(theme);
  selectRef.current = onSelect;
  themeRef.current = theme;

  useEffect(() => {
    if (!holder.current) return;
    const map = new MapLibreMap({
      container: holder.current,
      style: blankStyle(themeRef.current),
      center: uf === "DF" ? [-47.86, -15.78] : [-48.6, -22.4],
      zoom: uf === "DF" ? 8.2 : 5.8,
      attributionControl: {},
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("areas", { type: "geojson", data: empty() });
      map.addSource("calor", { type: "geojson", data: empty() });
      map.addLayer({ id: "areas", type: "fill", source: "areas", paint: { "fill-color": "#d9cbb8", "fill-opacity": 0.78 } });
      map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": theme === "dark" ? "#f4eee4" : "#1c1712", "line-width": 0.6, "line-opacity": 0.45 } });
      map.addLayer({
        id: "calor",
        type: "heatmap",
        source: "calor",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "w"], 0, 0, 1, 1],
          "heatmap-intensity": 1.1,
          "heatmap-radius": uf === "DF" ? 28 : 16,
          "heatmap-opacity": 0.72,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.35, "#1e6b58", 0.7, "#e7b089", 1, "#c4492c"],
        },
      });
      map.on("click", "areas", (event) => {
        const key = event.features?.[0]?.properties?.key;
        selectRef.current(typeof key === "string" && key ? key : null);
      });
      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mousemove", "areas", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const content = document.createElement("div");
        content.className = "map-popup";
        content.textContent = String(feature.properties?.texto ?? feature.properties?.nome ?? "Território");
        popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseleave", "areas", () => popup.remove());
      map.on("mouseenter", "areas", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "areas", () => { map.getCanvas().style.cursor = ""; });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [uf]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyTheme = () => {
      map.setLayoutProperty("light", "visibility", theme === "light" ? "visible" : "none");
      map.setLayoutProperty("dark", "visibility", theme === "dark" ? "visible" : "none");
      map.setPaintProperty("areas-line", "line-color", theme === "dark" ? "#f4eee4" : "#1c1712");
    };
    if (map.isStyleLoaded()) applyTheme();
    else map.once("load", applyTheme);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource("areas") as GeoJSONSource | undefined;
      if (!source || !geo) return;
      const lookup = new Map(regions.filter((item) => item.geoId != null).map((item) => [String(item.geoId), item]));
      const values = regions.map((item) => item.value).filter((item) => Number.isFinite(item));
      const max = Math.max(...values, 1);
      source.setData({
        type: "FeatureCollection",
        features: geo.features.map((feature) => {
          const id = String(feature.properties?.id ?? feature.id ?? "");
          const row = lookup.get(id);
          return {
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              key: row?.key ?? "",
              nome: row?.label ?? feature.properties?.nome,
              v: row ? row.value : -1,
              texto: row ? `${row.label}: ${metricLabel} ${formatPct(row.value)}` : "Sem votos neste recorte",
            },
          };
        }),
      });
      map.setPaintProperty("areas", "fill-color", [
        "case",
        ["<", ["get", "v"], 0],
        theme === "dark" ? "#3a332c" : "#ddd2c3",
        ["interpolate", ["linear"], ["get", "v"], 0, theme === "dark" ? "#3d4f49" : "#efe4d2", max, theme === "dark" ? "#f0a35e" : "#c4492c"],
      ]);
      map.setPaintProperty("areas-line", "line-width", ["case", ["==", ["get", "key"], selectedKey ?? ""], 2.4, 0.6]);
      const heat = map.getSource("calor") as GeoJSONSource | undefined;
      const peak = Math.max(...points.map((item) => item.w), 1);
      heat?.setData({
        type: "FeatureCollection",
        features: points.map((point) => ({ type: "Feature", properties: { w: point.w / peak, name: point.name }, geometry: { type: "Point", coordinates: [point.lon, point.lat] } })),
      });
      map.setLayoutProperty("areas", "visibility", mode === "calor" ? "none" : "visible");
      map.setLayoutProperty("areas-line", "visibility", mode === "calor" ? "none" : "visible");
      map.setLayoutProperty("calor", "visibility", mode === "regioes" ? "none" : "visible");
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [geo, regions, points, mode, theme, selectedKey, metricLabel]);

  useEffect(() => {
    mapRef.current?.flyTo({ center: uf === "DF" ? [-47.86, -15.78] : [-48.6, -22.4], zoom: uf === "DF" ? 8.2 : 5.8, essential: true });
  }, [uf]);

  return (
    <div className="map-shell">
      <div ref={holder} className="map" />
      <div className="map-legend">
        <span>menor</span>
        <i />
        <span>maior {metricLabel}</span>
      </div>
    </div>
  );
}

function empty(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function blankStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    sources: {
      light: { type: "raster", tiles: [LIGHT], tileSize: 256, attribution: "© OpenStreetMap © CARTO" },
      dark: { type: "raster", tiles: [DARK], tileSize: 256, attribution: "© OpenStreetMap © CARTO" },
    },
    layers: [
      { id: "light", type: "raster", source: "light", layout: { visibility: theme === "light" ? "visible" : "none" } },
      { id: "dark", type: "raster", source: "dark", layout: { visibility: theme === "dark" ? "visible" : "none" } },
    ],
  };
}
