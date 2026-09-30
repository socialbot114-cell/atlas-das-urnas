import type { Catalog, DfData, SpPoint, Uf, VoteFile, Zona } from "../types";
import { titleCase } from "./format";

export interface ZoneCandidateResult {
  id: number;
  nome: string;
  partido: string;
  numero: string;
  votos: number;
  percentual: number;
}

export interface ZoneLocalResult {
  id: string;
  nome: string;
  bairro: string;
  regiao: string;
  local: number;
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  lider: string;
  votosLider: number;
  percentualLider: number;
  segundo: string;
  votosSegundo: number;
  percentualSegundo: number;
  resultadosDisponiveis: boolean;
}

export interface ZoneDetail {
  uf: Uf;
  zona: number;
  cargo: string;
  territorio: string;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  secoes: number;
  locais: number;
  votosNominais: number;
  brancos: number;
  nulos: number;
  resultados: ZoneCandidateResult[];
  locaisDetalhe: ZoneLocalResult[];
  resultadosPorLocalDisponiveis: boolean;
}

export function buildZoneDetail(input: {
  catalog: Catalog;
  df: DfData;
  spPoints: SpPoint[];
  votes: VoteFile;
  zonas: Zona[];
  uf: Uf;
  zona: number;
  cargo: string;
  ra: number | null;
  munId: number | null;
}): ZoneDetail {
  const candidates = new Map(input.catalog.candidatos.map((candidate) => [candidate.i, candidate]));
  const nominalIds = new Set(input.catalog.candidatos
    .filter((candidate) => candidate.uf === input.uf && candidate.cargo === input.cargo && candidate.tipo === "nominal")
    .map((candidate) => candidate.i));
  const localDetail: ZoneLocalResult[] = input.uf === "DF"
    ? input.df.pontos
      .filter((point) => point.zona === input.zona && (input.ra == null || point.ra === input.ra))
      .map((point) => buildLocal({
        id: `DF-${point.zona}-${point.local}`,
        nome: point.nome,
        bairro: point.bairro,
        regiao: point.ra == null ? "RA não identificada" : titleCase(input.df.ras[point.ra]?.nome ?? "RA"),
        local: point.local,
        secoes: point.secoes,
        aptos: point.aptos,
        comparecimento: point.comp,
        abstencoes: point.abs,
        candidateVotes: ["Presidente", "Governador", "Senador"].includes(input.cargo) ? point.votos[input.cargo] ?? [] : [],
        nominalIds,
        candidates,
      }))
    : input.spPoints
      .filter((point) => point.zona === input.zona && (input.munId == null || point.mun === input.munId))
      .map((point) => buildLocal({
        id: `SP-${point.zona}-${point.local}`,
        nome: point.nome,
        bairro: point.bairro,
        regiao: titleCase(input.catalog.municipios.find((municipio) => municipio.i === point.mun)?.nome ?? "São Paulo"),
        local: point.local,
        secoes: point.secoes,
        aptos: point.aptos,
        comparecimento: point.comp,
        abstencoes: point.abs,
        candidateVotes: point.votos[input.cargo] ?? [],
        nominalIds,
        candidates,
      }));

  const zone = input.zonas.find((item) => item.zona === input.zona && (input.uf === "DF" || input.munId == null || item.mun === input.munId));
  const totals = new Map<number, number>();
  if (input.ra == null && zone) {
    const municipalityId = input.uf === "DF" ? input.catalog.municipios.find((municipality) => municipality.uf === "DF")?.i : input.munId ?? zone.mun;
    for (const [munId, zona, candidateId, votes] of input.votes.zona) {
      if (munId === municipalityId && zona === input.zona) totals.set(candidateId, (totals.get(candidateId) ?? 0) + votes);
    }
  } else {
    for (const point of input.df.pontos.filter((item) => input.uf === "DF" && item.zona === input.zona && item.ra === input.ra)) {
      for (const [id, votes] of point.votos[input.cargo] ?? []) totals.set(id, (totals.get(id) ?? 0) + votes);
    }
    if (input.uf === "SP") {
      for (const point of input.spPoints.filter((item) => item.zona === input.zona && (input.munId == null || item.mun === input.munId))) {
        for (const [id, votes] of point.votos[input.cargo] ?? []) totals.set(id, (totals.get(id) ?? 0) + votes);
      }
    }
  }

  let votosNominais = 0;
  let brancos = 0;
  let nulos = 0;
  for (const [id, votes] of totals) {
    const candidate = candidates.get(id);
    if (candidate?.tipo === "nominal") votosNominais += votes;
    else if (candidate?.tipo === "branco") brancos += votes;
    else if (["nulo", "anulado", "anulado_sep"].includes(candidate?.tipo ?? "")) nulos += votes;
  }
  const resultados = [...nominalIds]
    .map((id) => {
      const candidate = candidates.get(id)!;
      const votos = totals.get(id) ?? 0;
      return {
        id,
        nome: titleCase(candidate.nome),
        partido: candidate.partido || "—",
        numero: candidate.num,
        votos,
        percentual: votosNominais ? (votos / votosNominais) * 100 : 0,
      };
    })
    .filter((item) => item.votos > 0)
    .sort((a, b) => b.votos - a.votos);

  const localStats = localDetail.reduce((total, item) => ({
    aptos: total.aptos + item.aptos,
    comparecimento: total.comparecimento + item.comparecimento,
    abstencoes: total.abstencoes + item.abstencoes,
    secoes: total.secoes + item.secoes,
  }), { aptos: 0, comparecimento: 0, abstencoes: 0, secoes: 0 });
  const useZoneSummary = input.ra == null && zone != null;
  const municipality = input.munId == null ? null : input.catalog.municipios.find((item) => item.i === input.munId);
  const territorio = input.ra != null
    ? titleCase(input.df.ras[input.ra]?.nome ?? "Região administrativa")
    : input.uf === "DF" ? "Distrito Federal" : titleCase(municipality?.nome ?? "São Paulo");

  return {
    uf: input.uf,
    zona: input.zona,
    cargo: input.cargo,
    territorio,
    aptos: useZoneSummary ? zone.aptos : localStats.aptos,
    comparecimento: useZoneSummary ? zone.comp : localStats.comparecimento,
    abstencoes: useZoneSummary ? zone.abs : localStats.abstencoes,
    secoes: useZoneSummary ? zone.sec : localStats.secoes,
    locais: localDetail.length,
    votosNominais,
    brancos,
    nulos,
    resultados,
    locaisDetalhe: localDetail.sort((a, b) => b.votosLider - a.votosLider),
    resultadosPorLocalDisponiveis: localDetail.some((item) => item.resultadosDisponiveis),
  };
}

function buildLocal(input: {
  id: string;
  nome: string;
  bairro: string;
  regiao: string;
  local: number;
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  candidateVotes: [number, number][];
  nominalIds: Set<number>;
  candidates: Map<number, Catalog["candidatos"][number]>;
}): ZoneLocalResult {
  let votosNominais = 0;
  const ranking: { id: number; votes: number }[] = [];
  for (const [id, votes] of input.candidateVotes) {
    if (!input.nominalIds.has(id)) continue;
    votosNominais += votes;
    ranking.push({ id, votes });
  }
  ranking.sort((a, b) => b.votes - a.votes);
  const first = ranking[0];
  const second = ranking[1];
  const resultadosDisponiveis = ranking.length > 0;
  const lider = resultadosDisponiveis && first ? titleCase(input.candidates.get(first.id)?.nome ?? "—") : "—";
  const liderVotes = first?.votes ?? 0;
  const secondName = resultadosDisponiveis && second ? titleCase(input.candidates.get(second.id)?.nome ?? "—") : "—";
  const secondVotes = second?.votes ?? 0;
  return {
    id: input.id,
    nome: titleCase(input.nome),
    bairro: titleCase(input.bairro),
    regiao: input.regiao,
    local: input.local,
    secoes: input.secoes,
    aptos: input.aptos,
    comparecimento: input.comparecimento,
    abstencoes: input.abstencoes,
    lider,
    votosLider: liderVotes,
    percentualLider: votosNominais ? (liderVotes / votosNominais) * 100 : 0,
    segundo: secondName,
    votosSegundo: secondVotes,
    percentualSegundo: votosNominais ? (secondVotes / votosNominais) * 100 : 0,
    resultadosDisponiveis,
  };
}
