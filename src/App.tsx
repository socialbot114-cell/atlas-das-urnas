import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Chart, donutOption, heatOption, lineOption, radarOption, rankingOption, scatterOption, stackedOption, treemapOption } from "./components/Charts";
import { MapPanel } from "./components/MapPanel";
import { ZoneDetailModal } from "./components/ZoneDetailModal";
import { formatNumber, formatPct, titleCase } from "./lib/format";
import { loadBase, loadGeo, loadSpPoints, loadVotes } from "./lib/load";
import { buildView, cargosFor, searchAll } from "./lib/metrics";
import { buildZoneDetail } from "./lib/zone-detail";
import type { Catalog, DfData, Meta, Metric, MapMode, RaVotes, SpPoint, Theme, Uf, VoteFile, Zona } from "./types";

const METRICS: { id: Metric; label: string }[] = [
  { id: "share", label: "Voto do selecionado" },
  { id: "votos", label: "Votos absolutos" },
  { id: "abstencao", label: "Abstenção" },
  { id: "comparecimento", label: "Comparecimento" },
  { id: "concentracao", label: "Concentração do líder" },
];

export function App() {
  const [theme, setTheme] = useState<Theme>(() => (window.localStorage.getItem("tema") === "dark" ? "dark" : "light"));
  const [base, setBase] = useState<{ meta: Meta; catalog: Catalog; zonas: Zona[]; df: DfData; raVotes: RaVotes } | null>(null);
  const [votes, setVotes] = useState<VoteFile | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [spPoints, setSpPoints] = useState<SpPoint[]>([]);
  const [error, setError] = useState("");
  const [uf, setUf] = useState<Uf>("DF");
  const [cargo, setCargo] = useState("Presidente");
  const [munId, setMunId] = useState<number | null>(null);
  const [ra, setRa] = useState<number | null>(null);
  const [candId, setCandId] = useState<number | null>(null);
  const [partido, setPartido] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("share");
  const [mapMode, setMapMode] = useState<MapMode>("ambos");
  const [query, setQuery] = useState("");
  const [zoneQuery, setZoneQuery] = useState("");
  const [zoneModal, setZoneModal] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("tema", theme);
  }, [theme]);

  useEffect(() => {
    loadBase().then(([meta, catalog, zonas, df, raVotes]) => setBase({ meta, catalog, zonas, df, raVotes })).catch((reason: Error) => setError(reason.message));
    loadSpPoints().then(setSpPoints).catch(() => setSpPoints([]));
  }, []);

  useEffect(() => {
    if (!base) return;
    const available = cargosFor(base.catalog, uf);
    if (!available.includes(cargo)) setCargo(available[0] ?? "Presidente");
  }, [base, uf, cargo]);

  useEffect(() => {
    let cancel = false;
    setVotes(null);
    loadVotes(cargo).then((file) => { if (!cancel) setVotes(file); }).catch((reason: Error) => setError(reason.message));
    return () => { cancel = true; };
  }, [cargo]);

  useEffect(() => {
    let cancel = false;
    setGeo(null);
    loadGeo(uf === "DF" ? "/data/df-ra.geojson" : "/data/sp-mun.geojson").then((file) => { if (!cancel) setGeo(file); });
    return () => { cancel = true; };
  }, [uf]);

  const view = useMemo(() => {
    if (!base || !votes) return null;
    return buildView({ catalog: base.catalog, votes, zonas: base.zonas, df: base.df, raVotes: base.raVotes, uf, cargo, munId, ra, candId, partido, metric });
  }, [base, votes, uf, cargo, munId, ra, candId, partido, metric]);

  const results = base && query.trim().length >= 2 ? searchAll(base.catalog, base.df, base.zonas, query, uf, munId) : [];
  const zoneDetail = useMemo(() => {
    if (!base || !votes || zoneModal == null) return null;
    return buildZoneDetail({ catalog: base.catalog, df: base.df, spPoints, votes, zonas: base.zonas, uf, zona: zoneModal, cargo, ra, munId });
  }, [base, votes, spPoints, zoneModal, uf, cargo, ra, munId]);
  const filteredZones = view?.zones.filter((item) => {
    const needle = zoneQuery.trim().toLocaleLowerCase("pt-BR");
    return !needle || String(item.zona).includes(needle) || item.lider.toLocaleLowerCase("pt-BR").includes(needle) || item.regioes.some((region) => region.toLocaleLowerCase("pt-BR").includes(needle));
  }) ?? [];
  const activeId = candId ?? view?.selected?.i ?? null;
  const metricLabel = METRICS.find((item) => item.id === metric)?.label ?? "Indicador";
  const pointMetricLabel = uf === "SP" && !["Presidente", "Governador", "Senador"].includes(cargo) ? "Abstenção nos locais" : metricLabel;

  const points = useMemo(() => {
    if (!base || !view) return [];
    if (uf === "DF") {
      const nominal = new Set(base.catalog.candidatos.filter((item) => item.uf === "DF" && item.cargo === cargo && item.tipo === "nominal").map((item) => item.i));
       return base.df.pontos.flatMap((item) => {
        if (item.lat == null || item.lon == null || (ra != null && item.ra !== ra)) return [];
        let total = 0;
        let selected = 0;
        for (const [id, value] of item.votos[cargo] ?? []) {
          if (!nominal.has(id)) continue;
          total += value;
          if (id === activeId) selected += value;
        }
        const weight = metric === "abstencao" || metric === "comparecimento" ? (item.aptos ? (metric === "abstencao" ? item.abs : item.comp) / item.aptos : 0) : total ? selected / total : 0;
        return [{ lon: item.lon, lat: item.lat, w: weight, name: titleCase(item.nome) }];
      });
    }
    const pointsForScope = spPoints.filter((item): item is SpPoint & { lat: number; lon: number } => item.lat != null && item.lon != null && (munId == null || item.mun === munId));
    const nominalIds = new Set(base.catalog.candidatos.filter((item) => item.uf === "SP" && item.cargo === cargo && item.tipo === "nominal").map((item) => item.i));
    const localMetrics = pointsForScope.map((item) => {
      const pairs = item.votos[cargo] ?? [];
      let total = 0;
      let selected = 0;
      let leader = 0;
      for (const [id, value] of pairs) {
        if (!nominalIds.has(id)) continue;
        total += value;
        leader = Math.max(leader, value);
        if (id === activeId) selected = value;
      }
      const turnout = metric === "comparecimento" ? item.comp / Math.max(item.aptos, 1) : item.abs / Math.max(item.aptos, 1);
      const available = pairs.length > 0;
      const value = !available ? turnout
        : metric === "abstencao" ? item.abs / Math.max(item.aptos, 1)
          : metric === "comparecimento" ? item.comp / Math.max(item.aptos, 1)
            : metric === "concentracao" ? leader / Math.max(total, 1)
              : metric === "share" ? selected / Math.max(total, 1)
                : selected;
      return { item, value, available };
    });
    const peak = Math.max(...localMetrics.map((entry) => entry.value), 1);
    return localMetrics.map(({ item, value, available }) => ({
      lon: item.lon,
      lat: item.lat,
      w: metric === "votos" && available ? value / peak : value,
      name: "Local de votação",
    }));
  }, [base, view, uf, cargo, ra, munId, metric, activeId, spPoints]);

  function chooseUf(next: Uf) {
    setUf(next);
      setMunId(null);
      setRa(null);
      setCandId(null);
      setPartido(null);
      setZoneQuery("");
  }

  function selectRegion(key: string | null) {
    if (!key) {
      setRa(null);
      setMunId(null);
      return;
    }
    if (key.startsWith("ra-")) {
      const index = Number(key.slice(3));
      setRa((current) => (current === index ? null : index));
      setMunId(null);
      setZoneQuery("");
      return;
    }
    const index = Number(key.slice(4));
    setMunId((current) => (current === index ? null : index));
    setRa(null);
    setZoneQuery("");
  }

  if (error) return <main className="boot"><h1>Não foi possível abrir os dados</h1><p>{error}</p></main>;
  if (!base || !view || !votes) return <main className="boot"><p className="eyebrow">Atlas das Urnas</p><h1>Organizando os boletins.</h1></main>;

  const selectedKey = ra != null ? `ra-${ra}` : munId != null ? `mun-${munId}` : null;
  return (
    <>
      <a className="skip" href="#conteudo">Ir para o conteúdo</a>
      <header className="top">
        <div>
          <p className="eyebrow">1º turno · 2 de outubro de 2022</p>
          <h1>Atlas das Urnas</h1>
        </div>
        <div className="top-actions">
          <div className="segment" role="group" aria-label="Unidade da Federação">
            {(["DF", "SP"] as Uf[]).map((item) => <button key={item} aria-pressed={uf === item} onClick={() => chooseUf(item)}>{item === "DF" ? "Distrito Federal" : "São Paulo"}</button>)}
          </div>
          <button className="ghost" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Claro" : "Escuro"}</button>
        </div>
      </header>
      <main id="conteudo">
        <section className="toolbar">
          <label>Cargo<select value={cargo} onChange={(event) => { setCargo(event.target.value); setCandId(null); setPartido(null); }}>{cargosFor(base.catalog, uf).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Mapa<select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className="segment" role="group" aria-label="Camadas do mapa">
            {([["ambos", "Mapa + calor"], ["regioes", "Regiões"], ["calor", "Calor"]] as [MapMode, string][]).map(([id, label]) => <button key={id} aria-pressed={mapMode === id} onClick={() => setMapMode(id)}>{label}</button>)}
          </div>
          <label className="search">Busca
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Candidato, município, RA, zona ou local" />
            {results.length > 0 && (
              <ul className="results">
                {results.map((item, index) => (
                  <li key={`${item.kind}-${item.label}-${index}`}>
                    <button onClick={() => {
                      setUf(item.uf);
                      setCargo(item.cargo ?? cargo);
                      setCandId(item.candId ?? null);
                      setMunId(item.munId ?? null);
                      setRa(item.ra ?? null);
                      setZoneModal(item.zone ?? null);
                      setPartido(null);
                      setZoneQuery("");
                      setQuery("");
                    }}>
                      <strong>{item.label}</strong>
                      <small>{item.kind} · {item.hint}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        </section>
        <p className="reading">{view.reading}</p>
        {partido && <p className="chip-row"><button className="chip" onClick={() => setPartido(null)}>Partido {partido} · limpar</button></p>}
        {(ra != null || munId != null) && <p className="chip-row"><button className="chip" onClick={() => selectRegion(null)}>Recorte: {view.scopeLabel} · ver tudo</button></p>}
        <section className="kpis" aria-label="Indicadores">
          <Kpi label="Aptos" value={formatNumber(view.kpis.aptos)} />
          <Kpi label="Comparecimento" value={formatPct(view.kpis.aptos ? (view.kpis.comp / view.kpis.aptos) * 100 : 0)} note={formatNumber(view.kpis.comp)} />
          <Kpi label="Abstenção" value={formatPct(view.kpis.aptos ? (view.kpis.abs / view.kpis.aptos) * 100 : 0)} note={formatNumber(view.kpis.abs)} />
          <Kpi label="Votos nominais" value={formatNumber(view.kpis.nominal)} />
          <Kpi label="Brancos" value={formatNumber(view.kpis.branco)} />
          <Kpi label="Seções" value={formatNumber(view.kpis.secoes)} />
        </section>
        {cargo === "Presidente" && <Compare catalog={base.catalog} votes={votes} />}
        <section className="hero">
          <article className="card map-card">
            <header><p className="eyebrow">01 · Território</p><h2>{uf === "DF" ? "Regiões administrativas" : "Municípios"}</h2></header>
            <MapPanel uf={uf} theme={theme} mode={mapMode} regions={view.regions} geo={geo} points={points} selectedKey={selectedKey} metricLabel={pointMetricLabel} onSelect={selectRegion} />
            <p className="note">{uf === "DF" ? base.df.nota : "Malha municipal do IBGE. O calor mostra a abstenção dos locais de votação georreferenciados pelo TSE."} Cobertura DF: {base.df.cobertura.comCoordenada} locais com coordenada, {base.df.cobertura.semRa} sem região.</p>
          </article>
          <article className="card">
            <header><p className="eyebrow">02 · Ranking</p><h2>{view.selected ? titleCase(view.selected.nome) : "Candidatos"}</h2></header>
            <Chart option={rankingOption(view, theme, activeId)} label="Ranking de votos nominais" />
          </article>
        </section>
        <section className="mosaic">
          <Card kicker="03" title="Composição"><Chart option={donutOption(view, theme)} label="Composição dos votos" /></Card>
          <Card kicker="04" title="Partidos"><Chart option={treemapOption(view, theme)} label="Votos nominais por partido" /></Card>
          <Card kicker="05" title="Territórios"><Chart option={stackedOption(view, theme)} label="Votos empilhados por território" /></Card>
          <Card kicker="06" title="Dispersão"><Chart option={scatterOption(view, theme)} label="Abstenção e voto do candidato selecionado" /></Card>
          <Card kicker="07" title="Concentração"><Chart option={lineOption(view, theme)} label="Curva de concentração dos votos nominais" /></Card>
          <Card kicker="08" title="Perfil"><Chart option={radarOption(view, theme)} label="Perfil do recorte comparado à média regional" /></Card>
        </section>
        <article className="card wide">
          <header><p className="eyebrow">09 · Matriz</p><h2>Intensidade por território</h2></header>
          <Chart option={heatOption(view, theme)} label="Mapa de calor de candidatos por território" />
        </article>
        <article className="card wide">
          <header>
            <div><p className="eyebrow">10 · Microdados agregados</p><h2>Quem recebeu votos</h2></div>
            <button className="ghost" onClick={() => exportCsv(view.ranks, `${uf}-${cargo}`)}>Exportar CSV</button>
          </header>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidato</th><th>Nº</th><th>Partido</th><th>Votos</th><th>Nominais</th></tr></thead>
              <tbody>
                {view.ranks.slice(0, 80).map((item) => (
                  <tr key={item.id} className={item.id === activeId ? "is-active" : ""} onClick={() => setCandId(item.id)}>
                    <td>{item.nome}</td><td>{item.num}</td><td><button className="text" onClick={(event) => { event.stopPropagation(); setPartido(item.partido); }}>{item.partido}</button></td><td>{formatNumber(item.votos)}</td><td>{formatPct(item.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.zones.length > 0 && (
            <>
              <div className="zone-explorer-heading">
                <div><h3>Zonas eleitorais</h3><p>Selecione uma zona para abrir o resultado e os locais de votação.</p></div>
                <label className="zone-list-search"><span className="sr-only">Pesquisar zonas por número, RA ou liderança</span><input value={zoneQuery} onChange={(event) => setZoneQuery(event.target.value)} placeholder="Pesquisar zona, RA ou liderança" /></label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Zona</th><th>Região administrativa</th><th>Locais</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Líder nominal</th></tr></thead>
                  <tbody>
                    {filteredZones.map((item) => <tr key={item.zona} className="zone-row" onClick={() => setZoneModal(item.zona)}>
                      <td><button className="zone-open" onClick={(event) => { event.stopPropagation(); setZoneModal(item.zona); }}>Zona {item.zona}<span>ver detalhes ↗</span></button></td>
                      <td>{item.regioes.length ? item.regioes.join(", ") : view.scopeLabel}</td>
                      <td>{item.locais ? formatNumber(item.locais) : "—"}</td>
                      <td>{formatNumber(item.sec)}</td><td>{formatNumber(item.aptos)}</td><td>{formatPct(item.aptos ? (item.abs / item.aptos) * 100 : 0)}</td><td>{item.lider}</td>
                    </tr>)}
                    {filteredZones.length === 0 && <tr><td colSpan={7} className="table-empty">Nenhuma zona corresponde à pesquisa.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </main>
      <footer>
        <p>{base.meta.fonte}. Extração dos boletins em {base.meta.extracao}. Pleito em {base.meta.pleito}.</p>
        <ul>{base.meta.avisos.map((item) => <li key={item}>{item}</li>)}</ul>
        <p>{base.meta.geografias.join(" · ")}</p>
      </footer>
      <ZoneDetailModal detail={zoneDetail} onClose={() => setZoneModal(null)} />
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function Card({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return <article className="card"><header><p className="eyebrow">{kicker}</p><h2>{title}</h2></header>{children}</article>;
}

function Compare({ catalog, votes }: { catalog: Catalog; votes: VoteFile }) {
  const total = (uf: "DF" | "SP") => catalog.candidatos
    .filter((item) => item.uf === uf && item.cargo === "Presidente" && item.tipo === "nominal")
    .reduce((sum, item) => sum + ((votes.uf[uf] ?? []).find((pair) => pair[0] === item.i)?.[1] ?? 0), 0);
  const rows = ["13", "22", "15", "12"].map((num) => {
    const df = catalog.candidatos.find((item) => item.uf === "DF" && item.cargo === "Presidente" && item.num === num && item.tipo === "nominal");
    const sp = catalog.candidatos.find((item) => item.uf === "SP" && item.cargo === "Presidente" && item.num === num && item.tipo === "nominal");
    const dfVotes = df ? (votes.uf.DF ?? []).find((item) => item[0] === df.i)?.[1] ?? 0 : 0;
    const spVotes = sp ? (votes.uf.SP ?? []).find((item) => item[0] === sp.i)?.[1] ?? 0 : 0;
    return { num, nome: titleCase(df?.nome || sp?.nome || num), dfVotes, spVotes };
  }).filter((item) => item.dfVotes + item.spVotes > 0);
  const dfTotal = total("DF");
  const spTotal = total("SP");
  return (
    <section className="compare" aria-label="Comparação presidencial">
      {rows.map((item) => (
        <article key={item.num}>
          <strong>{item.nome}</strong>
          <span>DF {formatPct(dfTotal ? (item.dfVotes / dfTotal) * 100 : 0)}</span>
          <span>SP {formatPct(spTotal ? (item.spVotes / spTotal) * 100 : 0)}</span>
        </article>
      ))}
    </section>
  );
}

function exportCsv(rows: { nome: string; num: string; partido: string; votos: number; share: number }[], name: string) {
  const header = "candidato,numero,partido,votos,percentual_nominais";
  const body = rows.map((item) => [item.nome, item.num, item.partido, item.votos, item.share.toFixed(2)].join(","));
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `atlas-urnas-${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
