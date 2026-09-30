import type { Catalog, DfData, Meta, RaVotes, SpPoint, VoteFile, Zona } from "../types";
import { cargoSlug } from "./format";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao carregar ${url}`);
  return response.json() as Promise<T>;
}

const voteCache = new Map<string, Promise<VoteFile>>();

export function loadBase() {
  return Promise.all([
    getJson<Meta>("/data/meta.json"),
    getJson<Catalog>("/data/catalog.json"),
    getJson<Zona[]>("/data/zonas.json"),
    getJson<DfData>("/data/df.json"),
    getJson<RaVotes>("/data/df-ra-votos.json").catch(() => ({ ras: [] })),
  ]);
}

export function loadVotes(cargo: string): Promise<VoteFile> {
  const slug = cargoSlug(cargo);
  const cached = voteCache.get(slug);
  if (cached) return cached;
  const request = getJson<VoteFile>(`/data/votos-${slug}.json`);
  voteCache.set(slug, request);
  return request;
}

export function loadSpPoints(): Promise<SpPoint[]> {
  return getJson<SpPoint[]>("/data/sp-pontos.json");
}

export function loadGeo(url: string): Promise<GeoJSON.FeatureCollection> {
  return getJson(url);
}
