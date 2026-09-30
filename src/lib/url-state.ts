import type { AtlasView, MapMode, Metric, Theme, Uf } from "../types";

export interface UrlState {
  view: AtlasView;
  uf: Uf;
  cargo: string;
  munId: number | null;
  ra: number | null;
  candId: number | null;
  compareId: number | null;
  metric: Metric;
  mapMode: MapMode;
  zone: number | null;
  theme: Theme;
}

const views: AtlasView[] = ["panorama", "territorio", "comparar", "zonas"];
const metrics: Metric[] = ["share", "votos", "abstencao", "comparecimento", "concentracao"];
const modes: MapMode[] = ["ambos", "regioes", "calor"];
const number = (value: string | null) => value != null && /^\d+$/.test(value) ? Number(value) : null;

export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("vista") as AtlasView;
  const metric = params.get("metrica") as Metric;
  const mapMode = params.get("camada") as MapMode;
  return {
    view: views.includes(view) ? view : "panorama",
    uf: params.get("uf") === "SP" ? "SP" : "DF",
    cargo: params.get("cargo") || "Presidente",
    munId: number(params.get("municipio")),
    ra: number(params.get("ra")),
    candId: number(params.get("candidato")),
    compareId: number(params.get("comparar")),
    metric: metrics.includes(metric) ? metric : "share",
    mapMode: modes.includes(mapMode) ? mapMode : "ambos",
    zone: number(params.get("zona")),
    theme: params.get("tema") === "dark" || (!params.has("tema") && window.localStorage.getItem("tema") === "dark") ? "dark" : "light",
  };
}

export function writeUrlState(state: UrlState) {
  const params = new URLSearchParams();
  if (state.view !== "panorama") params.set("vista", state.view);
  if (state.uf !== "DF") params.set("uf", state.uf);
  if (state.cargo !== "Presidente") params.set("cargo", state.cargo);
  if (state.munId != null) params.set("municipio", String(state.munId));
  if (state.ra != null) params.set("ra", String(state.ra));
  if (state.candId != null) params.set("candidato", String(state.candId));
  if (state.compareId != null) params.set("comparar", String(state.compareId));
  if (state.metric !== "share") params.set("metrica", state.metric);
  if (state.mapMode !== "ambos") params.set("camada", state.mapMode);
  if (state.zone != null) params.set("zona", String(state.zone));
  if (state.theme === "dark") params.set("tema", "dark");
  const next = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", next);
}
