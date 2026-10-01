import { useState } from "react";
import type { View } from "../lib/metrics";
import { formatNumber, formatPct } from "../lib/format";

export function ZoneBrowser({ zones, total, scope, query, sort, loading, onQuery, onSort, onOpen, onExport }: {
  zones: View["zones"]; total: number; scope: string; query: string; sort: "zona" | "abstencao" | "aptos";
  loading: boolean; onQuery: (value: string) => void; onSort: (value: "zona" | "abstencao" | "aptos") => void;
  onOpen: (zone: number) => void; onExport: () => void;
}) {
  const [layout, setLayout] = useState("cards");
  const stats = zones.reduce((sum, zone) => ({ sections: sum.sections + zone.sec, locations: sum.locations + zone.locais, electorate: sum.electorate + zone.aptos }), { sections: 0, locations: 0, electorate: 0 });
  return <article className="card wide zone-browser">
    <header className="zone-browser-header"><div><p className="eyebrow">Explorar por zona</p><h2>{scope}</h2></div><button className="ghost zone-export" disabled={loading || !zones.length} onClick={onExport}>Exportar</button></header>
    <div className="zone-overview" aria-label="Resumo das zonas exibidas">
      <article className="motion-card"><span>Zonas {query ? "encontradas" : "no recorte"}</span><strong>{loading ? "—" : formatNumber(zones.length)}</strong><small>de {formatNumber(total)} disponíveis</small></article>
      <article className="motion-card"><span>Seções agregadas</span><strong>{loading ? "—" : formatNumber(stats.sections)}</strong><small>nas zonas exibidas</small></article>
      <article className="motion-card"><span>Locais de votação</span><strong>{loading ? "—" : formatNumber(stats.locations)}</strong><small>nas zonas exibidas</small></article>
      <article className="motion-card"><span>Eleitores aptos</span><strong>{loading ? "—" : formatNumber(stats.electorate)}</strong><small>nas zonas exibidas</small></article>
    </div>
    <div className="zone-browser-controls"><label className="zone-list-search"><span className="sr-only">Pesquisar zonas por número, região ou liderança</span><svg viewBox="0 0 24 24" className="search-icon" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar zona, região ou liderança" /></label><label className="zone-sort"><span className="sr-only">Ordenar zonas</span><select value={sort} onChange={(event) => onSort(event.target.value as typeof sort)}><option value="zona">Número da zona</option><option value="abstencao">Maior abstenção</option><option value="aptos">Mais eleitores</option></select></label><div className="segment zone-layout-control" role="group" aria-label="Exibição das zonas"><button aria-pressed={layout === "cards"} onClick={() => setLayout("cards")}>Fichas</button><button aria-pressed={layout === "table"} onClick={() => setLayout("table")}>Tabela</button></div></div>
    <p className="zone-share-note">Liderança sobre votos nominais. Comparecimento e abstenção sobre eleitores aptos. Seções e locais são contagens agregadas.</p>
    {loading ? <div className="zone-empty" role="status">Preparando zonas e locais de votação…</div> : <>
      <div className={`zone-card-list ${layout === "table" ? "desktop-hidden" : ""}`}>
        {zones.map((item) => <button key={item.zona} className="zone-card motion-card" onClick={() => onOpen(item.zona)} aria-label={`Abrir zona ${item.zona}. Líder nominal ${item.lider}, ${formatPct(item.percentualLider)} dos votos nominais com ${formatNumber(item.votosLider)} votos. ${formatNumber(item.aptos)} aptos, ${formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)} de abstenção`}>
          <span className="zone-card-top"><span className="zone-number-mark" aria-hidden="true">{String(item.zona).padStart(2, "0")}</span><span className="zone-card-title"><strong>Zona {item.zona}</strong><small>{item.regioes.length ? item.regioes.join(" · ") : scope}</small></span><span className="zone-chevron" aria-hidden="true">↗</span></span>
          <span className="zone-card-scale"><span>{formatNumber(item.sec)} seções</span><span>{formatNumber(item.locais)} locais</span></span>
          <span className="zone-card-leader"><span className="zone-card-leader-label">Líder nominal</span><span className="zone-card-leader-result"><strong className="zone-card-leader-name">{item.lider}</strong><span className="zone-card-leader-share"><b>{formatPct(item.percentualLider)}</b><small>{formatNumber(item.votosLider)} votos</small></span></span><span className="zone-card-leader-track" role="progressbar" aria-label={`${item.lider}: ${formatPct(item.percentualLider)} dos votos nominais`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percentualLider}><i style={{ width: `${Math.min(100, Math.max(0, item.percentualLider))}%` }} /></span><small className="zone-card-denominator">de {formatNumber(item.votos)} votos nominais na zona</small></span>
          <span className="zone-card-metrics"><span><small>Eleitores aptos</small><strong>{formatNumber(item.aptos)}</strong></span><span><small>Comparecimento</small><strong>{formatPct(item.aptos ? item.comp / item.aptos * 100 : 0)}</strong></span><span><small>Abstenção</small><strong>{formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)}</strong></span></span>
          <span className="zone-participation-track" aria-hidden="true"><i style={{ width: `${item.aptos ? item.comp / item.aptos * 100 : 0}%` }} /></span>
          <span className="zone-card-action">Abrir resultado e locais <b aria-hidden="true">→</b></span>
        </button>)}
      </div>
      {layout === "table" && <div className="desktop-zone-table table-wrap"><table><thead><tr><th>Zona</th><th>Região</th><th>Locais</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Líder · % nominais</th></tr></thead><tbody>{zones.map((item) => <tr key={item.zona}><td><button className="zone-open" onClick={() => onOpen(item.zona)}>Zona {item.zona}<span>ver detalhes ↗</span></button></td><td>{item.regioes.join(", ") || scope}</td><td>{item.locais || "—"}</td><td>{formatNumber(item.sec)}</td><td>{formatNumber(item.aptos)}</td><td>{formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)}</td><td><strong>{item.lider}</strong><small className="desktop-zone-leader-share">{formatNumber(item.votosLider)} votos · {formatPct(item.percentualLider)}</small></td></tr>)}</tbody></table></div>}
      {!zones.length && <p className="zone-empty">Nenhuma zona encontrada. Experimente outro número ou região.</p>}
    </>}
  </article>;
}
