import { useMemo, useState, type ReactNode } from "react";
import type { RankRow } from "../lib/metrics";
import { fold, formatNumber, formatPct, formatPoints } from "../lib/format";

export interface ComparisonRegion {
  key: string;
  label: string;
  nominal: number;
  first: number;
  second: number;
  firstVotes: number;
  secondVotes: number;
}

export function ComparisonPanel({ first, second, rows, scope, nominal, geography, onSwap, onOpenRegion, children }: {
  first: RankRow; second: RankRow; rows: ComparisonRegion[]; scope: string; nominal: number;
  geography: string; onSwap: () => void; onOpenRegion: (key: string) => void; children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("difference");
  const [limit, setLimit] = useState(8);
  const voteDifference = first.votos - second.votos;
  const ahead = voteDifference >= 0 ? first : second;
  const tied = voteDifference === 0;
  const firstWins = rows.filter((row) => row.firstVotes > row.secondVotes).length;
  const secondWins = rows.filter((row) => row.secondVotes > row.firstVotes).length;
  const otherShare = Math.max(0, 100 - first.share - second.share);
  const territories = useMemo(() => {
    const filtered = rows.filter((row) => fold(row.label).includes(fold(query)));
    return filtered.sort((a, b) => sort === "first" ? (b.first - b.second) - (a.first - a.second)
      : sort === "second" ? (b.second - b.first) - (a.second - a.first)
        : sort === "electorate" ? b.nominal - a.nominal
          : Math.abs(b.first - b.second) - Math.abs(a.first - a.second));
  }, [rows, query, sort]);

  return <>
    <div className="comparison-stage-toolbar"><span>Mesmo cargo. Mesmo recorte. Mesma base.</span><button className="ghost comparison-swap" onClick={onSwap}><span aria-hidden="true">⇄</span> Inverter candidatos</button></div>
    <div className="comparison-cards" key={`${first.id}-${second.id}-${scope}`}>
      <CandidateCard candidate={first} side="first" ahead={voteDifference > 0} />
      <article className="comparison-difference motion-card" aria-label="Diferença entre as candidaturas">
        <span className="difference-symbol" aria-hidden="true">↔</span><small>Distância no recorte</small>
        <strong>{formatPoints(Math.abs(first.share - second.share))}</strong>
        <span>{formatNumber(Math.abs(voteDifference))} votos de diferença</span>
        <b>{tied ? "Empate em votos" : `${ahead.nome} à frente`}</b>
      </article>
      <CandidateCard candidate={second} side="second" ahead={voteDifference < 0} />
    </div>

    <article className="comparison-distribution card motion-card">
      <header><div><p className="eyebrow">Participação no recorte</p><h3>Uma base comum para comparar.</h3></div><span className="data-provenance">{formatNumber(nominal)} votos nominais</span></header>
      <div className="duel-track" role="img" aria-label={`${first.nome}: ${formatPct(first.share)}. ${second.nome}: ${formatPct(second.share)}. Outras candidaturas: ${formatPct(otherShare)}.`}>
        <i className="duel-first" style={{ width: `${first.share}%` }} /><i className="duel-second" style={{ width: `${second.share}%` }} /><i className="duel-others" style={{ width: `${otherShare}%` }} />
      </div>
      <div className="duel-legend"><span><i className="duel-first" />{first.nome}<b>{formatPct(first.share)}</b></span><span><i className="duel-second" />{second.nome}<b>{formatPct(second.share)}</b></span><span><i className="duel-others" />Outras candidaturas<b>{formatPct(otherShare)}</b></span></div>
      <p className="note">Percentuais sobre todos os votos nominais de {scope}. A barra não considera apenas os dois candidatos.</p>
    </article>

    <div className="comparison-insights">
      <article className="insight-card motion-card first"><small>À frente no confronto</small><strong>{firstWins}<span> / {rows.length}</span></strong><p>{first.nome}</p></article>
      <article className="insight-card motion-card second"><small>À frente no confronto</small><strong>{secondWins}<span> / {rows.length}</span></strong><p>{second.nome}</p></article>
      <article className="insight-card motion-card"><small>Escala da leitura</small><strong>{rows.length}<span> territórios</span></strong><p>{geography} · {rows.length - firstWins - secondWins} empates em votos</p></article>
    </div>

    <article className="card wide comparison-territories motion-card">
      <header><div><p className="eyebrow">Diferença territorial</p><h2>Onde cada candidato se destaca</h2></div></header>
      <div className="comparison-legend"><span><i />{first.nome}</span><span><i />{second.nome}</span></div>
      {children}
      <p className="note">Barras positivas favorecem {first.nome}; negativas favorecem {second.nome}. O gráfico mostra até 14 territórios com maior diferença absoluta, em pontos percentuais.</p>
      <div className="territory-duel-controls"><label><span>Pesquisar território</span><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(8); }} placeholder="Nome do território" /></label><label>Ordenar leitura<select value={sort} onChange={(event) => { setSort(event.target.value); setLimit(8); }}><option value="difference">Maior diferença</option><option value="first">Vantagem do primeiro</option><option value="second">Vantagem do segundo</option><option value="electorate">Mais votos nominais</option></select></label></div>
      <div className="territory-duel-list">
        {territories.slice(0, limit).map((row) => <button className="territory-duel" key={row.key} onClick={() => onOpenRegion(row.key)} aria-label={`Explorar zonas de ${row.label}`}>
          <span className="territory-duel-heading"><strong>{row.label}</strong><b className={row.firstVotes === row.secondVotes ? "" : row.firstVotes > row.secondVotes ? "first" : "second"}>{formatPoints(Math.abs(row.first - row.second))}<i aria-hidden="true">↗</i></b></span>
          <span className="territory-duel-values"><span>{first.nome}<b>{formatPct(row.first)}</b></span><span>{second.nome}<b>{formatPct(row.second)}</b></span></span>
          <span className="duel-track" aria-hidden="true"><i className="duel-first" style={{ width: `${row.first}%` }} /><i className="duel-second" style={{ width: `${row.second}%` }} /></span>
          <span className="territory-duel-footnote">{formatNumber(row.nominal)} votos nominais · Explorar zonas</span>
        </button>)}
      </div>
      {!territories.length && <p className="table-empty">Nenhum território corresponde à busca.</p>}
      {limit < territories.length && <button className="ghost load-more" onClick={() => setLimit((value) => value + 12)}>Ver mais territórios <span aria-hidden="true">↓</span></button>}
    </article>
  </>;
}

function CandidateCard({ candidate, side, ahead }: { candidate: RankRow; side: "first" | "second"; ahead: boolean }) {
  const initials = candidate.nome.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("");
  return <article className={`comparison-card ${side} motion-card`}>
    <div className="candidate-card-top"><span className="eyebrow">{side === "first" ? "01 · Selecionado" : "02 · Comparado"}</span>{ahead && <span className="candidate-ahead">À frente</span>}</div>
    <div className="candidate-identity"><span className="candidate-monogram" aria-hidden="true">{initials}</span><div><h3>{candidate.nome}</h3><span>{candidate.partido} <i>·</i> nº {candidate.num}</span></div></div>
    <strong>{formatPct(candidate.share)}</strong><span className="candidate-share-label">dos votos nominais no recorte</span>
    <div className="candidate-votes-line"><span>Votos nominais</span><b>{formatNumber(candidate.votos)}</b></div>
    <div className="candidate-share-track" aria-hidden="true"><i style={{ width: `${candidate.share}%` }} /></div>
  </article>;
}
