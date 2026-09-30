import type { Candidato, Catalog, DfData, Metric, Municipio, Ponto, RaVotes, SpPoint, Uf, VoteFile, Zona } from "../types";
import { titleCase } from "./format";

export interface RankRow {
  id: number;
  nome: string;
  partido: string;
  num: string;
  votos: number;
  share: number;
}

export interface RegionRow {
  key: string;
  label: string;
  detail: string;
  aptos: number;
  comp: number;
  abs: number;
  nominal: number;
  selected: number;
  leader: string;
  leaderShare: number;
  value: number;
  geoId: string | number | null;
}

export interface Slice {
  nome: string;
  valor: number;
}

export interface SearchResult {
  kind: string;
  label: string;
  hint: string;
  uf: Uf;
  munId?: number;
  ra?: number;
  zone?: number;
  candId?: number;
  cargo?: string;
}

export interface View {
  ranks: RankRow[];
  regions: RegionRow[];
  composition: Slice[];
  parties: Slice[];
  kpis: { aptos: number; comp: number; abs: number; nominal: number; branco: number; nulo: number; legenda: number; secoes: number };
  reading: string;
  heatmap: { x: string[]; y: string[]; data: [number, number, number][] };
  scatter: { name: string; x: number; y: number; size: number }[];
  concentration: { nome: string; acumulado: number }[];
  stacked: { labels: string[]; series: { nome: string; dados: number[] }[] };
  radar: { indicators: { name: string; max: number }[]; atual: number[]; referencia: number[] };
  zones: { zona: number; aptos: number; comp: number; abs: number; sec: number; lider: string; votos: number; regioes: string[]; locais: number }[];
  selected: Candidato | null;
  scopeLabel: string;
}

function mapFromPairs(pairs: [number, number][] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  for (const [id, votes] of pairs ?? []) map.set(id, (map.get(id) ?? 0) + votes);
  return map;
}

function sum(map: Map<number, number>, ids: Set<number>): number {
  let total = 0;
  for (const [id, votes] of map) if (ids.has(id)) total += votes;
  return total;
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export function cargosFor(catalog: Catalog, uf: Uf): string[] {
  const order = ["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital"];
  const present = new Set(catalog.candidatos.filter((item) => item.uf === uf).map((item) => item.cargo));
  return order.filter((cargo) => present.has(cargo));
}

export function buildView(input: {
  catalog: Catalog;
  votes: VoteFile;
  zonas: Zona[];
  df: DfData;
  spPoints?: SpPoint[];
  raVotes: RaVotes;
  uf: Uf;
  cargo: string;
  munId: number | null;
  ra: number | null;
  candId: number | null;
  partido: string | null;
  metric: Metric;
}): View {
  const { catalog, uf, cargo } = input;
  const people = catalog.candidatos.filter((item) => item.uf === uf && item.cargo === cargo);
  const byId = new Map(people.map((item) => [item.i, item]));
  const nominalIds = new Set(people.filter((item) => item.tipo === "nominal").map((item) => item.i));
  const brancoIds = new Set(people.filter((item) => item.tipo === "branco").map((item) => item.i));
  const nuloIds = new Set(people.filter((item) => item.tipo === "nulo" || item.tipo === "anulado" || item.tipo === "anulado_sep").map((item) => item.i));
  const legendaIds = new Set(people.filter((item) => item.tipo === "legenda").map((item) => item.i));

  const munIndex = indexMun(input.votes);
  const scoped = scopeVotes(input, byId, munIndex);
  const nominal = sum(scoped, nominalIds);
  const branco = sum(scoped, brancoIds);
  const nulo = sum(scoped, nuloIds);
  const legenda = sum(scoped, legendaIds);
  const ranks = [...nominalIds]
    .map((id) => {
      const item = byId.get(id)!;
      const votos = scoped.get(id) ?? 0;
      return { id, nome: titleCase(item.nome), partido: item.partido || "—", num: item.num, votos, share: pct(votos, nominal) };
    })
    .filter((item) => item.votos > 0)
    .sort((a, b) => b.votos - a.votos);
  const filtered = input.partido ? ranks.filter((item) => item.partido === input.partido) : ranks;
  const selected = (input.candId != null ? ranks.find((item) => item.id === input.candId) : filtered[0]) ?? filtered[0] ?? null;
  const selectedCandidate = selected ? byId.get(selected.id) ?? null : null;

  const turnout = turnoutFor(input);
  const zoneIndex = indexZones(input.votes);
  const regions = regionsFor(input, byId, nominalIds, selected?.id ?? null, munIndex);
  const parties = partySlices(ranks);
  const topRegions = [...regions].sort((a, b) => b.aptos - a.aptos).slice(0, uf === "DF" ? 33 : 12);
  const topNames = filtered.slice(0, 8);
  const heatmap = {
    x: topNames.map((item) => item.nome.split(" ").slice(0, 2).join(" ")),
    y: topRegions.map((item) => item.label),
    data: [] as [number, number, number][],
  };
  topRegions.forEach((region, y) => {
    const local = regionVotes(input, region, munIndex);
    const base = sum(local, nominalIds);
    topNames.forEach((candidate, x) => heatmap.data.push([x, y, Number(pct(local.get(candidate.id) ?? 0, base).toFixed(1))]));
  });

  const leader = ranks[0];
  const reading = makeReading(input, turnout, branco, nulo, leader, selected);
  return {
    ranks: filtered,
    regions,
    composition: [
      { nome: "Nominais", valor: nominal },
      { nome: "Legenda", valor: legenda },
      { nome: "Brancos", valor: branco },
      { nome: "Nulos e anulados", valor: nulo },
    ].filter((item) => item.valor > 0),
    parties: parties.slice(0, 18),
    kpis: { ...turnout, nominal, branco, nulo, legenda },
    reading,
    heatmap,
    scatter: regions.map((item) => ({
      name: item.label,
      x: pct(item.abs, item.aptos),
      y: pct(item.selected, item.nominal),
      size: item.aptos,
    })),
    concentration: cumulative(filtered),
    stacked: stacked(input, topRegions.slice(0, 8), filtered.slice(0, 4), nominalIds, munIndex),
    radar: radarFor(turnout, nominal, branco, nulo, leader?.share ?? 0, selected?.share ?? 0, regions),
    zones: zoneRows(input, byId, nominalIds, zoneIndex),
    selected: selectedCandidate,
    scopeLabel: scopeLabel(input),
  };
}

function scopeVotes(input: Parameters<typeof buildView>[0], byId: Map<number, Candidato>, munIndex: Map<number, Map<number, number>>): Map<number, number> {
  if (input.ra != null) {
    const entry = input.raVotes.ras[input.ra];
    if (entry?.votos?.[input.cargo]) return mapFromPairs(entry.votos[input.cargo]);
    return votesFromPoints(input.df.pontos.filter((item) => item.ra === input.ra), input.cargo);
  }
  if (input.munId != null) {
    const map = new Map<number, number>();
    for (const [id, votos] of munIndex.get(input.munId) ?? []) if (byId.has(id)) map.set(id, votos);
    return map;
  }
  const map = mapFromPairs(input.votes.uf[input.uf]);
  for (const id of [...map.keys()]) if (!byId.has(id)) map.delete(id);
  return map;
}

function votesFromPoints(points: Ponto[], cargo: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const point of points) {
    for (const [id, votos] of point.votos[cargo] ?? []) map.set(id, (map.get(id) ?? 0) + votos);
  }
  return map;
}

function turnoutFor(input: Parameters<typeof buildView>[0]) {
  if (input.ra != null) {
    const ra = input.df.ras[input.ra];
    const sec = ra?.secoes ?? 0;
    return { aptos: ra?.aptos ?? 0, comp: ra?.comp ?? 0, abs: ra?.abs ?? 0, secoes: sec };
  }
  const list = input.catalog.municipios.filter((item) => item.uf === input.uf && (input.munId == null || item.i === input.munId));
  return {
    aptos: list.reduce((total, item) => total + item.aptos, 0),
    comp: list.reduce((total, item) => total + item.comp, 0),
    abs: list.reduce((total, item) => total + item.abs, 0),
    secoes: list.reduce((total, item) => total + item.sec, 0),
  };
}

function indexMun(votes: VoteFile): Map<number, Map<number, number>> {
  const index = new Map<number, Map<number, number>>();
  for (const [mid, id, value] of votes.mun) {
    let bucket = index.get(mid);
    if (!bucket) {
      bucket = new Map();
      index.set(mid, bucket);
    }
    bucket.set(id, (bucket.get(id) ?? 0) + value);
  }
  return index;
}

function indexZones(votes: VoteFile): Map<string, number> {
  const index = new Map<string, number>();
  for (const [mid, zone, candidate, value] of votes.zona) {
    const key = `${mid}:${zone}:${candidate}`;
    index.set(key, (index.get(key) ?? 0) + value);
  }
  return index;
}

function regionsFor(input: Parameters<typeof buildView>[0], byId: Map<number, Candidato>, nominalIds: Set<number>, selectedId: number | null, munIndex: Map<number, Map<number, number>>): RegionRow[] {
  if (input.uf === "DF") {
    return input.df.ras.map((ra, index) => {
      const votes = mapFromPairs(input.raVotes.ras[index]?.votos?.[input.cargo]) ;
      if (votes.size === 0) {
        const fromPoints = votesFromPoints(input.df.pontos.filter((item) => item.ra === index), input.cargo);
        fromPoints.forEach((value, id) => votes.set(id, value));
      }
      return regionRow(`ra-${index}`, titleCase(ra.nome), `RA ${ra.roman}`, ra.aptos, ra.comp, ra.abs, votes, byId, nominalIds, selectedId, index, input.metric);
    });
  }
  const muns = input.catalog.municipios.filter((item) => item.uf === "SP");
  return muns.map((mun) => {
    const votes = munIndex.get(mun.i) ?? new Map<number, number>();
    return regionRow(`mun-${mun.i}`, titleCase(mun.nome), `${mun.sec} seções`, mun.aptos, mun.comp, mun.abs, votes, byId, nominalIds, selectedId, mun.ibge, input.metric);
  });
}

function regionRow(
  key: string,
  label: string,
  detail: string,
  aptos: number,
  comp: number,
  abs: number,
  votes: Map<number, number>,
  byId: Map<number, Candidato>,
  nominalIds: Set<number>,
  selectedId: number | null,
  geoId: string | number | null,
  metric: Metric,
): RegionRow {
  let nominal = 0;
  let leaderVotes = 0;
  let leader = "—";
  for (const [id, value] of votes) {
    if (!nominalIds.has(id)) continue;
    nominal += value;
    if (value > leaderVotes) {
      leaderVotes = value;
      leader = titleCase(byId.get(id)?.nome ?? "—");
    }
  }
  const selected = selectedId == null ? 0 : votes.get(selectedId) ?? 0;
  const leaderShare = pct(leaderVotes, nominal);
  const value = metric === "abstencao" ? pct(abs, aptos) : metric === "comparecimento" ? pct(comp, aptos) : metric === "concentracao" ? leaderShare : metric === "votos" ? selected : pct(selected, nominal);
  return { key, label, detail, aptos, comp, abs, nominal, selected, leader, leaderShare, value, geoId };
}

function regionVotes(input: Parameters<typeof buildView>[0], region: RegionRow, munIndex: Map<number, Map<number, number>>): Map<number, number> {
  if (region.key.startsWith("ra-")) {
    const index = Number(region.key.slice(3));
    const direct = mapFromPairs(input.raVotes.ras[index]?.votos?.[input.cargo]);
    return direct.size ? direct : votesFromPoints(input.df.pontos.filter((item) => item.ra === index), input.cargo);
  }
  return munIndex.get(Number(region.key.slice(4))) ?? new Map();
}

function partySlices(ranks: RankRow[]): Slice[] {
  const map = new Map<string, number>();
  for (const row of ranks) map.set(row.partido, (map.get(row.partido) ?? 0) + row.votos);
  return [...map.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
}

function cumulative(ranks: RankRow[]) {
  let running = 0;
  const total = ranks.reduce((sumVotes, item) => sumVotes + item.votos, 0);
  return ranks.slice(0, 40).map((item) => {
    running += item.votos;
    return { nome: item.nome, acumulado: pct(running, total) };
  });
}

function stacked(input: Parameters<typeof buildView>[0], regions: RegionRow[], leaders: RankRow[], nominalIds: Set<number>, munIndex: Map<number, Map<number, number>>) {
  const labels = regions.map((item) => item.label);
  const series = leaders.map((leader) => ({ nome: leader.nome.split(" ").slice(0, 2).join(" "), dados: [] as number[] }));
  const others = { nome: "Outros", dados: [] as number[] };
  for (const region of regions) {
    const votes = regionVotes(input, region, munIndex);
    let used = 0;
    leaders.forEach((leader, index) => {
      const value = votes.get(leader.id) ?? 0;
      series[index].dados.push(value);
      used += value;
    });
    others.dados.push(Math.max(0, sum(votes, nominalIds) - used));
  }
  return { labels, series: [...series, others] };
}

function radarFor(turnout: { aptos: number; comp: number; abs: number }, nominal: number, branco: number, nulo: number, leaderShare: number, selectedShare: number, regions: RegionRow[]) {
  const cast = nominal + branco + nulo;
  const atual = [pct(turnout.comp, turnout.aptos), pct(turnout.abs, turnout.aptos), pct(branco, cast), pct(nulo, cast), leaderShare, selectedShare];
  const reference = regions.length
    ? [
        regions.reduce((total, item) => total + pct(item.comp, item.aptos), 0) / regions.length,
        regions.reduce((total, item) => total + pct(item.abs, item.aptos), 0) / regions.length,
        pct(branco, cast),
        pct(nulo, cast),
        regions.reduce((total, item) => total + item.leaderShare, 0) / regions.length,
        regions.reduce((total, item) => total + pct(item.selected, item.nominal), 0) / regions.length,
      ]
    : atual;
  return {
    indicators: [
      { name: "Comparecimento", max: 100 },
      { name: "Abstenção", max: 100 },
      { name: "Brancos", max: 40 },
      { name: "Nulos", max: 40 },
      { name: "Líder", max: 100 },
      { name: "Selecionado", max: 100 },
    ],
    atual: atual.map((item) => Number(item.toFixed(1))),
    referencia: reference.map((item) => Number(item.toFixed(1))),
  };
}

function zoneRows(input: Parameters<typeof buildView>[0], byId: Map<number, Candidato>, nominalIds: Set<number>, zoneIndex: Map<string, number>) {
  if (input.ra != null) {
    if (!["Presidente", "Governador", "Senador"].includes(input.cargo)) return [];
    const grouped = new Map<number, { aptos: number; comp: number; abs: number; sec: number; locais: number; candidates: Map<number, number> }>();
    for (const point of input.df.pontos) {
      if (point.ra !== input.ra) continue;
      let zone = grouped.get(point.zona);
      if (!zone) {
        zone = { aptos: 0, comp: 0, abs: 0, sec: 0, locais: 0, candidates: new Map() };
        grouped.set(point.zona, zone);
      }
      zone.aptos += point.aptos;
      zone.comp += point.comp;
      zone.abs += point.abs;
      zone.sec += point.secoes;
      zone.locais += 1;
      for (const [id, value] of point.votos[input.cargo] ?? []) {
        zone.candidates.set(id, (zone.candidates.get(id) ?? 0) + value);
      }
    }
    return [...grouped.entries()].map(([zona, values]) => {
      let lider = "—";
      let votos = 0;
      let best = 0;
      for (const [id, total] of values.candidates) {
        if (!nominalIds.has(id)) continue;
        votos += total;
        if (total > best) {
          best = total;
          lider = titleCase(byId.get(id)?.nome ?? "—");
        }
      }
      return { zona, aptos: values.aptos, comp: values.comp, abs: values.abs, sec: values.sec, lider, votos, regioes: [titleCase(input.df.ras[input.ra!]?.nome ?? "")], locais: values.locais };
    }).sort((a, b) => a.zona - b.zona);
  }
  const munId = input.uf === "DF" ? input.catalog.municipios.find((item) => item.uf === "DF")?.i : input.munId;
  if (munId == null) return [];
  return input.zonas
    .filter((item) => item.mun === munId)
    .map((item) => {
      let leader = "—";
      let best = 0;
      let votos = 0;
      for (const id of nominalIds) {
        const value = zoneIndex.get(`${munId}:${item.zona}:${id}`) ?? 0;
        if (value <= 0) continue;
        votos += value;
        if (value > best) {
          best = value;
          leader = titleCase(byId.get(id)?.nome ?? "—");
        }
      }
       const places = input.uf === "DF" ? input.df.pontos.filter((point) => point.zona === item.zona) : input.spPoints?.filter((point) => point.mun === item.mun && point.zona === item.zona) ?? [];
       const regionNames = [...new Set(input.df.pontos.filter((point) => point.zona === item.zona).flatMap((point) => point.ra == null ? [] : [titleCase(input.df.ras[point.ra]?.nome ?? "")]))];
      const municipality = input.catalog.municipios.find((entry) => entry.i === item.mun);
      const territories = input.uf === "DF" ? regionNames : [titleCase(municipality?.nome ?? "")];
      return { zona: item.zona, aptos: item.aptos, comp: item.comp, abs: item.abs, sec: item.sec, lider: leader, votos, regioes: territories, locais: places.length };
    })
    .sort((a, b) => a.zona - b.zona);
}

function scopeLabel(input: Parameters<typeof buildView>[0]): string {
  if (input.ra != null) return titleCase(input.df.ras[input.ra]?.nome ?? "Região");
  if (input.munId != null) return titleCase(input.catalog.municipios.find((item) => item.i === input.munId)?.nome ?? "Município");
  return input.uf === "DF" ? "Distrito Federal" : "São Paulo";
}

function makeReading(input: Parameters<typeof buildView>[0], turnout: { aptos: number; comp: number; abs: number }, branco: number, nulo: number, leader: RankRow | undefined, selected: RankRow | null): string {
  if (!leader) return "Não há votos nominais neste recorte.";
  const abst = pct(turnout.abs, turnout.aptos);
  const selectedText = selected && selected.id !== leader.id ? ` ${selected.nome} reúne ${selected.share.toFixed(1).replace(".", ",")}% dos votos nominais.` : "";
  return `${scopeLabel(input)}: ${leader.nome} lidera ${input.cargo.toLocaleLowerCase("pt-BR")} com ${leader.share.toFixed(1).replace(".", ",")}% dos votos nominais.${selectedText} Abstenção de ${abst.toFixed(1).replace(".", ",")}% sobre ${turnout.aptos.toLocaleString("pt-BR")} aptos. Brancos e nulos somam ${(branco + nulo).toLocaleString("pt-BR")} votos.`;
}

export function searchAll(catalog: Catalog, df: DfData, zonas: Zona[], query: string, uf: Uf, munId: number | null): SearchResult[] {
  const needle = query.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  if (needle.length < 2) return [];
  const results: SearchResult[] = [];
  const zoneMatch = needle.match(/^(?:zona|ze)\s*(\d+)$/);
  if (zoneMatch) {
    const number = Number(zoneMatch[1]);
    const matches = zonas.filter((item) => {
      if (item.zona !== number) return false;
      const municipality = catalog.municipios.find((entry) => entry.i === item.mun);
      if (!municipality || municipality.uf !== uf) return false;
       return uf === "DF" || munId == null || item.mun === munId;
    });
    return matches.slice(0, 12).map((item) => {
      const municipality = catalog.municipios.find((entry) => entry.i === item.mun);
      return {
        kind: "Zona eleitoral",
         label: `Zona ${item.zona}${uf === "SP" ? ` · ${titleCase(municipality?.nome ?? "")}` : ""}`,
        hint: `${item.sec} seções · ${municipality?.uf ?? uf} · ${titleCase(municipality?.nome ?? "")}`,
        uf,
        munId: item.mun,
        zone: item.zona,
      };
    });
  }
  for (const mun of catalog.municipios) {
    if (fold(mun.nome).includes(needle)) results.push({ kind: "Município", label: titleCase(mun.nome), hint: mun.uf, uf: mun.uf, munId: mun.i });
  }
  const regionNeedle = needle.replace(/^ra\s+/, "");
  df.ras.forEach((ra, index) => {
    if (fold(ra.nome).includes(regionNeedle)) results.push({ kind: "Região administrativa", label: titleCase(ra.nome), hint: `RA ${ra.roman}`, uf: "DF", ra: index });
  });
  for (const point of df.pontos) {
    if (results.length > 16) break;
    if (fold(`${point.nome} ${point.bairro}`).includes(needle)) {
      results.push({ kind: "Local de votação", label: titleCase(point.nome), hint: `${titleCase(point.bairro)} · zona ${point.zona}`, uf: "DF", ra: point.ra ?? undefined });
    }
  }
  for (const candidate of catalog.candidatos) {
    if (candidate.tipo !== "nominal") continue;
    if (fold(`${candidate.nome} ${candidate.partido} ${candidate.num}`).includes(needle)) {
      results.push({ kind: candidate.cargo, label: titleCase(candidate.nome), hint: `${candidate.num} · ${candidate.partido || "sem partido"} · ${candidate.uf}`, uf: candidate.uf, candId: candidate.i, cargo: candidate.cargo });
    }
    if (results.length > 24) break;
  }
  return results.slice(0, 12);
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function metricValue(region: RegionRow, metric: Metric): number {
  if (metric === "abstencao") return pct(region.abs, region.aptos);
  if (metric === "comparecimento") return pct(region.comp, region.aptos);
  if (metric === "concentracao") return region.leaderShare;
  if (metric === "votos") return region.selected;
  return pct(region.selected, region.nominal);
}

export type { Municipio };
