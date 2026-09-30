import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chart, donutOption, heatOption, lineOption, radarOption, rankingOption, scatterOption, stackedOption, treemapOption, comparisonOption, zonesOption } from "./components/Charts";
import { MapPanel } from "./components/MapPanel";
import { ZoneDetailModal } from "./components/ZoneDetailModal";
import { markWelcomeComplete, shouldShowWelcome, WelcomeIntro } from "./components/WelcomeIntro";
import { fold, formatNumber, formatPct, titleCase } from "./lib/format";
import { loadBase, loadGeo, loadSpPoints, loadVotes } from "./lib/load";
import { buildView, cargosFor, searchAll, type View } from "./lib/metrics";
import { buildZoneDetail } from "./lib/zone-detail";
import { readUrlState, urlForState, writeUrlState } from "./lib/url-state";
import type { AtlasView, Catalog, DfData, Meta, Metric, MapMode, RaVotes, SpPoint, Theme, Uf, VoteFile, Zona } from "./types";

const METRICS: { id: Metric; label: string }[] = [
  { id: "share", label: "Voto do selecionado" },
  { id: "votos", label: "Votos absolutos" },
  { id: "abstencao", label: "Abstenção" },
  { id: "comparecimento", label: "Comparecimento" },
  { id: "concentracao", label: "Concentração do líder" },
];

export function App() {
  const initial = useMemo(readUrlState, []);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
  const [base, setBase] = useState<{ meta: Meta; catalog: Catalog; zonas: Zona[]; df: DfData; raVotes: RaVotes } | null>(null);
  const [votes, setVotes] = useState<VoteFile | null>(null);
  const [votesCargo, setVotesCargo] = useState<string | null>(null);
  const [lastView, setLastView] = useState<View | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [spPoints, setSpPoints] = useState<SpPoint[]>([]);
  const [error, setError] = useState("");
  const [uf, setUf] = useState<Uf>(initial.uf);
  const [cargo, setCargo] = useState(initial.cargo);
  const [munId, setMunId] = useState<number | null>(initial.munId);
  const [ra, setRa] = useState<number | null>(initial.ra);
  const [candId, setCandId] = useState<number | null>(initial.candId);
  const [compareId, setCompareId] = useState<number | null>(initial.compareId);
  const [atlasView, setAtlasView] = useState<AtlasView>(initial.view);
  const [partido, setPartido] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>(initial.metric);
  const [mapMode, setMapMode] = useState<MapMode>(initial.mapMode);
  const [query, setQuery] = useState("");
  const [zoneQuery, setZoneQuery] = useState("");
  const [zoneSort, setZoneSort] = useState<"zona" | "abstencao" | "aptos">("zona");
  const [zoneModal, setZoneModal] = useState<number | null>(initial.zone);
  const closeZone = useCallback(() => setZoneModal(null), []);
  const [copied, setCopied] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");
  const [municipalityPickerOpen, setMunicipalityPickerOpen] = useState(false);
  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [candidatePickerTarget, setCandidatePickerTarget] = useState<"first" | "second" | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("tema", theme); } catch { /* The selected theme remains active for this visit. */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101820" : "#f6f4ef");
  }, [theme]);

  useEffect(() => {
    writeUrlState({ view: atlasView, uf, cargo, munId, ra, candId, compareId, metric, mapMode, zone: zoneModal, theme });
  }, [atlasView, uf, cargo, munId, ra, candId, compareId, metric, mapMode, zoneModal, theme]);

  useEffect(() => {
    const restore = () => {
      const state = readUrlState();
      setAtlasView(state.view); setUf(state.uf); setCargo(state.cargo);
      setMunId(state.munId); setRa(state.ra); setCandId(state.candId);
      setCompareId(state.compareId); setMetric(state.metric); setMapMode(state.mapMode);
      setZoneModal(state.zone); setTheme(state.theme);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    loadBase().then(([meta, catalog, zonas, df, raVotes]) => setBase({ meta, catalog, zonas, df, raVotes })).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (uf !== "SP") {
      setSpPoints([]);
      return;
    }
    let cancel = false;
    loadSpPoints().then((data) => { if (!cancel) setSpPoints(data); }).catch(() => { if (!cancel) setSpPoints([]); });
    return () => { cancel = true; };
  }, [uf]);

  useEffect(() => {
    if (!base) return;
    const available = cargosFor(base.catalog, uf);
    if (!available.includes(cargo)) setCargo(available[0] ?? "Presidente");
  }, [base, uf, cargo]);

  useEffect(() => {
    let cancel = false;
    setVotesCargo(null);
    loadVotes(cargo).then((file) => { if (!cancel) { setVotes(file); setVotesCargo(cargo); } }).catch((reason: Error) => setError(reason.message));
    return () => { cancel = true; };
  }, [cargo]);

  useEffect(() => {
    let cancel = false;
    setGeo(null);
    if (atlasView !== "panorama" && atlasView !== "territorio") return () => { cancel = true; };
    loadGeo(uf === "DF" ? "/data/df-ra.geojson" : "/data/sp-mun.geojson").then((file) => { if (!cancel) setGeo(file); });
    return () => { cancel = true; };
  }, [uf, atlasView]);

  const currentView = useMemo(() => {
    if (!base || !votes || votesCargo !== cargo) return null;
    return buildView({ catalog: base.catalog, votes, zonas: base.zonas, df: base.df, spPoints, raVotes: base.raVotes, uf, cargo, munId, ra, candId, partido, metric });
  }, [base, votes, votesCargo, spPoints, uf, cargo, munId, ra, candId, partido, metric]);
  useEffect(() => { if (currentView) setLastView(currentView); }, [currentView]);
  const view = currentView ?? lastView;

  const results = base && query.trim().length >= 2 ? searchAll(base.catalog, base.df, base.zonas, query, uf, munId) : [];
  const municipalityResults = useMemo(() => {
    if (!base) return [];
    const municipalities = base.catalog.municipios.filter((item) => item.uf === "SP");
    if (municipalityQuery.trim()) {
      const needle = fold(municipalityQuery);
      return municipalities.filter((item) => fold(item.nome).includes(needle)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 30);
    }
    const featured = ["São Paulo", "Campinas", "Guarulhos", "São Bernardo do Campo", "Santos", "Ribeirão Preto", "Sorocaba", "São José dos Campos"];
    return featured.map((name) => municipalities.find((item) => fold(item.nome) === fold(name))).filter((item): item is typeof municipalities[number] => item != null);
  }, [base, municipalityQuery]);
  const zoneDetail = useMemo(() => {
    if (!base || !votes || votesCargo !== cargo || zoneModal == null || (uf === "SP" && munId == null) || (uf === "DF" && ra != null && !["Presidente", "Governador", "Senador"].includes(cargo))) return null;
    return buildZoneDetail({ catalog: base.catalog, df: base.df, spPoints, votes, zonas: base.zonas, uf, zona: zoneModal, cargo, ra, munId });
  }, [base, votes, votesCargo, spPoints, zoneModal, uf, cargo, ra, munId]);
  const filteredZones = view?.zones.filter((item) => {
    const needle = zoneQuery.trim().toLocaleLowerCase("pt-BR");
    return !needle || String(item.zona).includes(needle) || item.lider.toLocaleLowerCase("pt-BR").includes(needle) || item.regioes.some((region) => region.toLocaleLowerCase("pt-BR").includes(needle));
  }).sort((a, b) => zoneSort === "aptos" ? b.aptos - a.aptos : zoneSort === "abstencao" ? b.abs / Math.max(b.aptos, 1) - a.abs / Math.max(a.aptos, 1) : a.zona - b.zona) ?? [];
  const highAbstentionZones = useMemo(() => [...(view?.zones ?? [])].filter((item) => item.aptos > 0).sort((a, b) => b.abs / b.aptos - a.abs / a.aptos).slice(0, 12), [view]);
  const activeId = candId ?? view?.selected?.i ?? null;
  const comparisonCandidates = useMemo(() => {
    if (!view) return [];
    const allowed = view.ranks.filter((item) => candidatePickerTarget !== "second" || item.id !== activeId);
    if (!candidateQuery.trim()) return allowed.slice(0, 30);
    const needle = fold(candidateQuery);
    return allowed.filter((item) => fold(`${item.nome} ${item.partido} ${item.num}`).includes(needle)).slice(0, 50);
  }, [view, candidatePickerTarget, activeId, candidateQuery]);
  const comparison = useMemo(() => {
    if (!base || !votes || votesCargo !== cargo || !view || atlasView !== "comparar") return null;
    const other = compareId != null && compareId !== activeId && view.ranks.some((item) => item.id === compareId)
      ? compareId : view.ranks.find((item) => item.id !== activeId)?.id;
    if (other == null) return null;
    const first = view.ranks.find((item) => item.id === activeId);
    const second = view.ranks.find((item) => item.id === other);
    if (!first || !second) return null;
    const compared = buildView({ catalog: base.catalog, votes, zonas: base.zonas, df: base.df, spPoints, raVotes: base.raVotes, uf, cargo, munId, ra, candId: other, partido: null, metric: "share" });
    return { first, second, rows: view.regions.map((region, index) => ({
      label: region.label, aptos: region.aptos,
      first: region.nominal ? region.selected / region.nominal * 100 : 0,
      second: compared.regions[index]?.nominal ? compared.regions[index].selected / compared.regions[index].nominal * 100 : 0,
    })).filter((row) => row.aptos > 0) };
  }, [base, votes, votesCargo, spPoints, view, compareId, activeId, uf, cargo, munId, ra, atlasView]);
  const metricLabel = METRICS.find((item) => item.id === metric)?.label ?? "Indicador";
  const localVotesAvailable = uf === "SP" ? cargo === "Presidente" : ["Presidente", "Governador", "Senador"].includes(cargo);
  const pointMetricLabel = !localVotesAvailable && metric !== "comparecimento" ? "Abstenção nos locais" : metricLabel;

  const points = useMemo(() => {
    if (!base || !view) return [];
    if (uf === "DF") {
      const nominal = new Set(base.catalog.candidatos.filter((item) => item.uf === "DF" && item.cargo === cargo && item.tipo === "nominal").map((item) => item.i));
      const locals = base.df.pontos.filter((item): item is typeof item & { lat: number; lon: number } => item.lat != null && item.lon != null && (ra == null || item.ra === ra));
      const measured = locals.map((item) => {
         let total = 0;
         let selected = 0;
         let leader = 0;
         for (const [id, value] of item.votos[cargo] ?? []) {
           if (!nominal.has(id)) continue;
           total += value;
           leader = Math.max(leader, value);
           if (id === activeId) selected += value;
         }
         const value = !localVotesAvailable ? (metric === "comparecimento" ? item.comp : item.abs) / Math.max(item.aptos, 1)
           : metric === "abstencao" ? item.abs / Math.max(item.aptos, 1)
           : metric === "comparecimento" ? item.comp / Math.max(item.aptos, 1)
             : metric === "concentracao" ? leader / Math.max(total, 1)
               : metric === "votos" ? selected : selected / Math.max(total, 1);
         return { item, value };
       });
      const peak = Math.max(...measured.map((entry) => entry.value), 1);
      return measured.map(({ item, value }) => ({ lon: item.lon, lat: item.lat, w: metric === "votos" && localVotesAvailable ? value / peak : value, name: titleCase(item.nome) }));
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
  }, [base, view, uf, cargo, ra, munId, metric, activeId, spPoints, localVotesAvailable]);

  function navigateView(next: AtlasView) {
    if (next === atlasView) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setMobileSearchOpen(false);
      return;
    }
    const nextUrl = urlForState({ view: next, uf, cargo, munId, ra, candId, compareId, metric, mapMode, zone: zoneModal, theme });
    window.history.pushState(null, "", nextUrl);
    setAtlasView(next);
    setMobileSearchOpen(false);
    setMunicipalityPickerOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function chooseSearchResult(item: (typeof results)[number]) {
    setUf(item.uf);
    setCargo(item.cargo ?? cargo);
    setCandId(item.candId ?? null);
    setMunId(item.munId ?? null);
    setRa(item.ra ?? null);
    setZoneModal(item.zone ?? null);
    setPartido(null);
    setZoneQuery("");
    setQuery("");
    setMobileSearch("");
    setMobileSearchOpen(false);
  }

  function chooseMunicipality(id: number) {
    setMunId(id);
    setRa(null);
    setMunicipalityPickerOpen(false);
    setMunicipalityQuery("");
    setZoneQuery("");
  }

  const closeMobileSearch = useCallback(() => { setMobileSearchOpen(false); setMobileSearch(""); setQuery(""); }, []);
  const closeMunicipalityPicker = useCallback(() => { setMunicipalityPickerOpen(false); setMunicipalityQuery(""); }, []);
  const closeCandidatePicker = useCallback(() => { setCandidatePickerTarget(null); setCandidateQuery(""); }, []);
  const finishWelcome = useCallback(() => { markWelcomeComplete(); setWelcomeOpen(false); }, []);

  function chooseComparisonCandidate(id: number) {
    if (candidatePickerTarget === "first") setCandId(id);
    else setCompareId(id);
    closeCandidatePicker();
  }

  function chooseUf(next: Uf) {
    setUf(next);
      setMunId(null);
      setRa(null);
      setCandId(null);
      setPartido(null);
      setCompareId(null);
      setZoneModal(null);
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
  if (welcomeOpen) return <WelcomeIntro onFinish={finishWelcome} />;
  if (!base || !view || !votes) return <main className="boot" role="status"><img src="/app-icon.svg" alt="" /><p className="eyebrow">Atlas das Urnas</p><h1>Preparando seu Atlas</h1><span>Carregando os resultados eleitorais...</span></main>;

  const selectedKey = ra != null ? `ra-${ra}` : munId != null ? `mun-${munId}` : null;
  const selectedRegion = selectedKey ? view.regions.find((item) => item.key === selectedKey) ?? null : null;
  const regionPeak = Math.max(...view.regions.map((item) => item.value), 1);
  const map = <MapPanel uf={uf} theme={theme} mode={mapMode} regions={view.regions} geo={geo} points={points} selectedKey={selectedKey} metricLabel={metricLabel} pointMetricLabel={pointMetricLabel} absolute={metric === "votos"} onSelect={selectRegion} />;
  const mapNote = <details className="map-note"><summary>Metodologia e cobertura</summary><p className="note">{uf === "DF" ? `${base.df.nota} ${base.df.cobertura.comCoordenada} de ${base.df.cobertura.locais} locais aparecem no mapa; os demais permanecem nos totais e nas tabelas.` : "Malha municipal do IBGE. Pontos representam locais georreferenciados."} {localVotesAvailable ? "O calor representa o indicador selecionado por local." : `A votação completa por local deste cargo não está no arquivo publicado; o calor representa ${pointMetricLabel.toLocaleLowerCase("pt-BR")}.`}</p></details>;
  const pp = (value: number) => `${value.toFixed(1).replace(".", ",")} p.p.`;
  return (
    <div className="app-shell" aria-busy={Boolean(lastView && !currentView)}>
      <a className="skip" href="#conteudo">Ir para o conteúdo</a>
      <header className="top">
        <div className="brand-lockup">
          <img src="/app-icon.svg" alt="" />
          <div>
            <p className="eyebrow">Atlas eleitoral · 1º turno · 2022</p>
            <h1>Atlas das Urnas</h1>
          </div>
        </div>
        <div className="top-actions">
          <div className="segment" role="group" aria-label="Unidade da Federação">
            {(["DF", "SP"] as Uf[]).map((item) => <button key={item} aria-label={item === "DF" ? "Distrito Federal" : "São Paulo"} aria-pressed={uf === item} onClick={() => chooseUf(item)}><span className="uf-full">{item === "DF" ? "Distrito Federal" : "São Paulo"}</span><span className="uf-short">{item}</span></button>)}
          </div>
          <button className="help-button desktop-help" aria-label="Ajuda: como usar o Atlas" title="Como usar o Atlas" onClick={() => setWelcomeOpen(true)}><HelpIcon /></button>
          <button className="ghost theme-toggle" aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><ThemeIcon theme={theme} /><span>{theme === "dark" ? "Claro" : "Escuro"}</span></button>
        </div>
      </header>
      <main id="conteudo">
        <nav className="view-nav" aria-label="Vistas do atlas">
          {([["home", "Início", "Visão geral"], ["panorama", "Análise", "Painel completo"], ["territorio", "Território", "Explore o mapa"], ["comparar", "Comparar", "Dois candidatos"], ["zonas", "Zonas e locais", "Escala eleitoral"]] as [AtlasView, string, string][]).map(([id, label, hint], index) => (
            <button key={id} aria-current={atlasView === id ? "page" : undefined} onClick={() => navigateView(id)}><small>0{index + 1} · {hint}</small><strong>{label}</strong></button>
          ))}
        </nav>
        <section className="toolbar">
          <label>Cargo<select value={cargo} onChange={(event) => { setCargo(event.target.value); setCandId(null); setCompareId(null); setPartido(null); }}>{cargosFor(base.catalog, uf).map((item) => <option key={item}>{item}</option>)}</select></label>
          {(atlasView === "panorama" || atlasView === "territorio") && <label>Mapa<select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
          {(atlasView === "panorama" || atlasView === "territorio") && <div className="segment" role="group" aria-label="Camadas do mapa">
            {([["ambos", "Mapa + calor"], ["regioes", "Regiões"], ["calor", "Calor"]] as [MapMode, string][]).map(([id, label]) => <button key={id} aria-pressed={mapMode === id} onClick={() => setMapMode(id)}>{label}</button>)}
          </div>}
          <label className="search">Busca
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Candidato, município, RA, zona ou local" />
            {results.length > 0 && (
              <ul className="results">
                {results.map((item, index) => (
                  <li key={`${item.kind}-${item.label}-${index}`}>
                    <button onClick={() => chooseSearchResult(item)}>
                      <strong>{item.label}</strong>
                      <small>{item.kind} · {item.hint}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        </section>
        <button className="mobile-search-launch" onClick={() => { setMobileSearch(query); setMobileSearchOpen(true); }}><SearchIcon /><span>Buscar candidatos, cidades, zonas...</span><kbd>⌕</kbd></button>
        <details className="mobile-options">
          <summary><span className="mobile-options-title">Filtros</span><span className="mobile-options-current">{cargo}{atlasView === "panorama" || atlasView === "territorio" ? ` · ${metricLabel}` : ""}</span></summary>
          <div className="mobile-options-panel">
            <label>Cargo<select value={cargo} onChange={(event) => { setCargo(event.target.value); setCandId(null); setCompareId(null); setPartido(null); }}>{cargosFor(base.catalog, uf).map((item) => <option key={item}>{item}</option>)}</select></label>
            {(atlasView === "panorama" || atlasView === "territorio") && <>
              <label>Indicador do mapa<select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <div className="segment" role="group" aria-label="Camadas do mapa">
                {([["ambos", "Mapa + calor"], ["regioes", "Regiões"], ["calor", "Calor"]] as [MapMode, string][]).map(([id, label]) => <button key={id} aria-pressed={mapMode === id} onClick={() => setMapMode(id)}>{label}</button>)}
             </div>
            </>}
            <button className="mobile-help-button" onClick={() => setWelcomeOpen(true)}><HelpIcon /><span>Como usar o Atlas</span><b aria-hidden="true">›</b></button>
          </div>
        </details>
        <div className="context-bar"><span>{uf === "DF" ? "Distrito Federal" : "São Paulo"}</span><span>{cargo}</span>{(ra != null || munId != null) && <span>{view.scopeLabel}</span>}<button className="ghost share-link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); } }}>{copied ? "Link copiado ✓" : "Copiar link ↗"}</button></div>
        {atlasView === "home" && <HomePage uf={uf} cargo={cargo} view={view} focusedCandidateId={candId} onOpen={navigateView} onSearch={() => { setMobileSearch(query); setMobileSearchOpen(true); }} />}
        {(atlasView === "panorama" || atlasView === "territorio") && <><p className="reading">{view.reading}</p>{atlasView === "panorama" && view.ranks[0] && <p className="mobile-reading"><span>RESULTADO PRINCIPAL</span><strong>{view.ranks[0].nome}</strong><span>lidera {cargo.toLocaleLowerCase("pt-BR")} em {view.scopeLabel} com {formatPct(view.ranks[0].share)} dos votos nominais.</span></p>}</>}
        {partido && <p className="chip-row"><button className="chip" onClick={() => setPartido(null)}>Partido {partido} · limpar</button></p>}
        {(ra != null || munId != null) && <p className="chip-row"><button className="chip" onClick={() => selectRegion(null)}>Recorte: {view.scopeLabel} · ver tudo</button></p>}
        {atlasView === "panorama" && <section className="kpis" aria-label="Indicadores">
          <Kpi label="Aptos" value={formatNumber(view.kpis.aptos)} />
          <Kpi label="Comparecimento" value={formatPct(view.kpis.aptos ? (view.kpis.comp / view.kpis.aptos) * 100 : 0)} note={formatNumber(view.kpis.comp)} />
          <Kpi label="Abstenção" value={formatPct(view.kpis.aptos ? (view.kpis.abs / view.kpis.aptos) * 100 : 0)} note={formatNumber(view.kpis.abs)} />
          <Kpi label="Votos nominais" value={formatNumber(view.kpis.nominal)} />
          <Kpi label="Brancos" value={formatNumber(view.kpis.branco)} />
          <Kpi label="Seções" value={formatNumber(view.kpis.secoes)} />
        </section>}
        {atlasView === "panorama" && cargo === "Presidente" && <Compare catalog={base.catalog} votes={votes} />}
        {atlasView === "panorama" && <>
        <section className="hero">
          <article className="card map-card">
            <header><p className="eyebrow">01 · Território</p><h2>{uf === "DF" ? "Regiões administrativas" : "Municípios"}</h2></header>
            {map}{mapNote}
          </article>
          <article className="card">
            <header><p className="eyebrow">02 · Ranking</p><h2>{view.selected ? titleCase(view.selected.nome) : "Candidatos"}</h2></header>
            <Chart option={rankingOption(view, theme, activeId)} label="Ranking de votos nominais" />
          </article>
        </section>
        <div className="section-bridge"><div><p className="eyebrow">Aprofundar</p><h2>Uma eleição, muitas escalas.</h2><p>Explore o território, compare candidatos ou desça até as zonas e locais de votação.</p></div><button className="ghost" onClick={() => navigateView("territorio")}>Explorar território ↗</button></div>
        <details className="advanced"><summary>Análises adicionais <span>Composição · partidos · dispersão · concentração</span></summary>
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
        </details>
        </>}
        {atlasView === "territorio" && <section className="territory-layout">
          <article className="card map-card"><header><div><p className="eyebrow">Território · {metricLabel}</p><h2>{uf === "DF" ? "Regiões administrativas" : "Municípios"}</h2></div></header>{map}{selectedRegion && <div className="map-selection-card"><div><small>Área selecionada</small><strong>{selectedRegion.label}</strong><span>{formatNumber(selectedRegion.aptos)} eleitores · {formatPct(selectedRegion.aptos ? selectedRegion.abs / selectedRegion.aptos * 100 : 0)} de abstenção</span></div><button onClick={() => navigateView("zonas")}>Ver zonas <span aria-hidden="true">›</span></button><button className="selection-clear" aria-label="Limpar seleção do mapa" onClick={() => selectRegion(null)}>×</button></div>}{mapNote}</article>
          <article className="card territory-list"><header><div><p className="eyebrow">Leitura territorial</p><h2>Do maior para o menor</h2></div></header><p className="note">Selecione uma área para atualizar todo o atlas. {metric === "votos" ? "Votos do candidato selecionado." : `${metricLabel} em percentual.`}</p>{selectedKey && <div className="territory-profile"><span>Recorte ativo · {view.scopeLabel}</span><strong>{formatNumber(view.kpis.aptos)} aptos</strong><small>{formatPct(view.kpis.aptos ? view.kpis.abs / view.kpis.aptos * 100 : 0)} de abstenção · {formatNumber(view.kpis.secoes)} seções</small></div>}<div className="territory-scroll">{[...view.regions].sort((a, b) => b.value - a.value).map((item, index) => <button key={item.key} className="territory-item" aria-pressed={item.key === selectedKey} onClick={() => selectRegion(item.key)}><span className="territory-index">{String(index + 1).padStart(2, "0")}</span><span className="territory-item-body"><strong>{item.label}</strong><small>{item.detail} · {formatNumber(item.aptos)} aptos</small><i style={{ width: `${Math.max(0, Math.min(100, item.value / regionPeak * 100))}%` }} /></span><b>{metric === "votos" ? formatNumber(item.value) : formatPct(item.value)}</b></button>)}</div></article>
        </section>}
        {atlasView === "comparar" && <section className="comparison-view"><div className="section-intro"><p className="eyebrow">Comparar · {view.scopeLabel}</p><h2>Dois candidatos, lado a lado.</h2><p>Percentuais sobre votos nominais do mesmo cargo. A diferença é expressa em pontos percentuais.</p></div>
          <div className="comparison-controls desktop-comparison-controls"><label>Primeiro candidato<select value={activeId ?? ""} onChange={(event) => setCandId(Number(event.target.value))}>{view.ranks.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.partido}</option>)}</select></label><label>Segundo candidato<select value={comparison?.second.id ?? ""} onChange={(event) => setCompareId(Number(event.target.value))}>{view.ranks.filter((item) => item.id !== activeId).map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.partido}</option>)}</select></label></div>
          <div className="mobile-comparison-pickers"><button onClick={() => setCandidatePickerTarget("first")}><small>01 · PRIMEIRO CANDIDATO</small><strong>{comparison?.first.nome ?? "Escolher candidato"}</strong><span>{comparison?.first.partido ?? "Toque para pesquisar"} <i>›</i></span></button><button onClick={() => setCandidatePickerTarget("second")}><small>02 · SEGUNDO CANDIDATO</small><strong>{comparison?.second.nome ?? "Escolher candidato"}</strong><span>{comparison?.second.partido ?? "Toque para pesquisar"} <i>›</i></span></button></div>
          {comparison ? <><div className="comparison-cards"><article className="comparison-card first"><p className="eyebrow">01 · Selecionado</p><h3>{comparison.first.nome}</h3><strong>{formatPct(comparison.first.share)}</strong><span>{formatNumber(comparison.first.votos)} votos nominais</span></article><article className="comparison-difference"><small>Diferença no recorte</small><strong>{pp(Math.abs(comparison.first.share - comparison.second.share))}</strong><span>entre as participações</span></article><article className="comparison-card second"><p className="eyebrow">02 · Comparado</p><h3>{comparison.second.nome}</h3><strong>{formatPct(comparison.second.share)}</strong><span>{formatNumber(comparison.second.votos)} votos nominais</span></article></div><article className="card wide"><header><div><p className="eyebrow">Diferença territorial</p><h2>Onde cada candidato se destaca</h2></div></header><Chart option={comparisonOption(comparison.rows, theme, comparison.first.nome, comparison.second.nome)} label="Diferença em pontos percentuais entre candidatos por território" /><p className="note">Barras positivas favorecem {comparison.first.nome}; negativas favorecem {comparison.second.nome}. Mostramos os territórios com maior diferença absoluta.</p></article></> : <p className="note">Selecione dois candidatos com votos neste recorte para comparar.</p>}
        </section>}
        {atlasView === "zonas" && <div className="section-intro"><p className="eyebrow">Zonas e locais · 1º turno</p><h2>A eleição vista de perto.</h2><p>Explore resultados agregados por zona e os locais de votação que a compõem.</p>{uf === "DF" && ra != null && !localVotesAvailable && <p className="note">O cruzamento RA × zona para este cargo não tem votação completa por local. Remova o recorte de RA acima para explorar os resultados completos por zona no DF.</p>}{uf === "SP" && munId == null && <><label className="municipality-picker desktop-municipality-picker">Escolha um município de São Paulo<select value="" onChange={(event) => chooseMunicipality(Number(event.target.value))}><option value="" disabled>Selecionar município</option>{base.catalog.municipios.filter((item) => item.uf === "SP").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((item) => <option key={item.i} value={item.i}>{titleCase(item.nome)}</option>)}</select></label><button className="mobile-municipality-trigger" onClick={() => setMunicipalityPickerOpen(true)}><span>Município</span><strong>Escolha sua cidade</strong><span aria-hidden="true">›</span></button></>}</div>}
        {atlasView === "panorama" && <article className="card wide">
          <header>
            <div><p className="eyebrow">Microdados agregados</p><h2>Quem recebeu votos</h2></div>
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
                <div className="zone-list-actions"><label className="zone-list-search"><span className="sr-only">Pesquisar zonas por número, RA ou liderança</span><input value={zoneQuery} onChange={(event) => setZoneQuery(event.target.value)} placeholder="Pesquisar zona, RA ou liderança" /></label><label className="zone-sort">Ordenar zonas<select value={zoneSort} onChange={(event) => setZoneSort(event.target.value as typeof zoneSort)}><option value="zona">Número</option><option value="abstencao">Maior abstenção</option><option value="aptos">Mais aptos</option></select></label><button className="ghost" onClick={() => exportZonesCsv(filteredZones, `${uf}-${view.scopeLabel}`)}>Exportar zonas</button></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Zona</th><th>Região administrativa</th><th>Locais</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Líder · % nominais</th></tr></thead>
                  <tbody>
                    {filteredZones.map((item) => <tr key={item.zona} className="zone-row" onClick={() => setZoneModal(item.zona)}>
                       <td><button className="zone-open" onClick={(event) => { event.stopPropagation(); setZoneModal(item.zona); }}>Zona {item.zona}<span>ver detalhes ↗</span></button></td>
                      <td>{item.regioes.length ? item.regioes.join(", ") : view.scopeLabel}</td>
                      <td>{item.locais ? formatNumber(item.locais) : "—"}</td>
                       <td>{formatNumber(item.sec)}</td><td>{formatNumber(item.aptos)}</td><td>{formatPct(item.aptos ? (item.abs / item.aptos) * 100 : 0)}</td><td>{item.lider} · {formatPct(item.percentualLider)}</td>
                    </tr>)}
                    {filteredZones.length === 0 && <tr><td colSpan={7} className="table-empty">Nenhuma zona corresponde à pesquisa.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>}
        {atlasView === "zonas" && <>
          <article className="card wide zone-browser">
            <header className="zone-browser-header"><div><p className="eyebrow">Explorar por zona</p><h2>{munId != null || ra != null ? view.scopeLabel : "Todas as zonas"}</h2></div><button className="ghost zone-export" onClick={() => exportZonesCsv(filteredZones, `${uf}-${view.scopeLabel}`)}>Exportar</button></header>
            <div className="zone-browser-controls"><label className="zone-list-search"><span className="sr-only">Pesquisar zonas por número, região ou liderança</span><SearchIcon /><input value={zoneQuery} onChange={(event) => setZoneQuery(event.target.value)} placeholder="Buscar zona, região ou liderança" /></label><label className="zone-sort"><span className="sr-only">Ordenar zonas</span><select value={zoneSort} onChange={(event) => setZoneSort(event.target.value as typeof zoneSort)}><option value="zona">Número da zona</option><option value="abstencao">Maior abstenção</option><option value="aptos">Mais eleitores</option></select></label></div>
            <p className="zone-share-note">O percentual mostra a participação do líder sobre os votos nominais da zona.</p>
            <div className="zone-card-list">{filteredZones.map((item) => <button key={`${munId ?? "df"}-${item.zona}`} className="zone-card" onClick={() => setZoneModal(item.zona)} aria-label={`Abrir zona ${item.zona}. Líder nominal ${item.lider}, ${formatPct(item.percentualLider)} dos votos nominais com ${formatNumber(item.votosLider)} votos. ${formatNumber(item.aptos)} aptos, ${formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)} de abstenção`}>
              <span className="zone-card-top"><span className="zone-card-title"><strong>Zona {item.zona}</strong><small>{item.regioes.length ? item.regioes.join(" · ") : view.scopeLabel}</small></span><span className="zone-chevron" aria-hidden="true">›</span></span>
              <span className="zone-card-leader"><span className="zone-card-leader-label">Líder nominal</span><span className="zone-card-leader-result"><strong className="zone-card-leader-name">{item.lider}</strong><span className="zone-card-leader-share"><b>{formatPct(item.percentualLider)}</b><small>{formatNumber(item.votosLider)} votos</small></span></span><span className="zone-card-leader-track" role="progressbar" aria-label={`${item.lider}: ${formatPct(item.percentualLider)} dos votos nominais`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percentualLider}><i style={{ width: `${Math.min(100, Math.max(0, item.percentualLider))}%` }} /></span><small className="zone-card-denominator">de {formatNumber(item.votos)} votos nominais na zona</small></span>
              <span className="zone-card-metrics"><span><small>Eleitores aptos</small><strong>{formatNumber(item.aptos)}</strong></span><span><small>Seções</small><strong>{formatNumber(item.sec)}</strong></span><span><small>Abstenção</small><strong>{formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)}</strong></span></span>
            </button>)}{filteredZones.length === 0 && <p className="zone-empty">Nenhuma zona encontrada. Experimente outro número ou região.</p>}</div>
            <div className="desktop-zone-table table-wrap"><table><thead><tr><th>Zona</th><th>Região</th><th>Locais</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Líder · % nominais</th></tr></thead><tbody>{filteredZones.map((item) => <tr key={`table-${munId ?? "df"}-${item.zona}`}><td><button className="zone-open" onClick={() => setZoneModal(item.zona)}>Zona {item.zona}<span>ver detalhes ↗</span></button></td><td>{item.regioes.join(", ") || view.scopeLabel}</td><td>{item.locais || "—"}</td><td>{formatNumber(item.sec)}</td><td>{formatNumber(item.aptos)}</td><td>{formatPct(item.aptos ? item.abs / item.aptos * 100 : 0)}</td><td><strong>{item.lider}</strong><small className="desktop-zone-leader-share">{formatNumber(item.votosLider)} votos · {formatPct(item.percentualLider)}</small></td></tr>)}</tbody></table></div>
          </article>
          {highAbstentionZones.length > 0 && <details className="zone-distribution-more"><summary>Ver distribuição da abstenção</summary><article className="card wide zone-distribution"><header><div><p className="eyebrow">Distribuição · {view.scopeLabel}</p><h2>Zonas com maior abstenção</h2></div></header><Chart option={zonesOption(highAbstentionZones, theme)} label="As doze zonas com maior taxa de abstenção" onSelect={(index) => setZoneModal(highAbstentionZones[index].zona)} /><p className="note">Taxa sobre eleitores aptos. Toque em uma barra para abrir a zona.</p></article></details>}
        </>}
      </main>
      {mobileSearchOpen && <MobileSheet title="Buscar no Atlas" onClose={closeMobileSearch}>
        <label className="sheet-search"><span className="sr-only">Buscar candidato, município, região administrativa ou zona</span><SearchIcon /><input className="sheet-autofocus" autoFocus value={mobileSearch} onChange={(event) => { setMobileSearch(event.target.value); setQuery(event.target.value); }} placeholder="Candidato, cidade, RA ou zona" /></label>
        <div className="sheet-results" aria-live="polite">{results.length ? results.map((item, index) => <button key={`${item.kind}-${item.label}-${index}`} onClick={() => chooseSearchResult(item)}><span className="sheet-result-icon"><ViewIcon view={item.kind === "Zona eleitoral" ? "zonas" : item.kind === "Município" || item.kind === "Região administrativa" ? "territorio" : "comparar"} /></span><span><strong>{item.label}</strong><small>{item.kind} · {item.hint}</small></span><span className="sheet-chevron">›</span></button>) : mobileSearch.trim().length >= 2 ? <p className="sheet-empty">Nenhum resultado. Tente outro nome ou número.</p> : <div className="sheet-hint"><p>Encontre candidatos, municípios, regiões e zonas eleitorais.</p><span>Ex.: Lula · Taguatinga · Zona 15</span></div>}</div>
      </MobileSheet>}
      {municipalityPickerOpen && <MobileSheet title="Escolher município" onClose={closeMunicipalityPicker}>
        <label className="sheet-search"><span className="sr-only">Buscar município de São Paulo</span><SearchIcon /><input className="sheet-autofocus" autoFocus value={municipalityQuery} onChange={(event) => setMunicipalityQuery(event.target.value)} placeholder="Digite o nome do município" /></label>
        <div className="sheet-results municipality-results" aria-live="polite">{municipalityResults.map((item) => <button key={item.i} onClick={() => chooseMunicipality(item.i)}><span><strong>{titleCase(item.nome)}</strong><small>{formatNumber(item.aptos)} eleitores · {formatNumber(item.sec)} seções</small></span><span className="sheet-chevron">›</span></button>)}{municipalityResults.length === 0 && <p className="sheet-empty">Nenhum município encontrado.</p>}</div>
      </MobileSheet>}
      {candidatePickerTarget && <MobileSheet title={candidatePickerTarget === "first" ? "Primeiro candidato" : "Segundo candidato"} onClose={closeCandidatePicker}>
        <label className="sheet-search"><span className="sr-only">Buscar candidato por nome, partido ou número</span><SearchIcon /><input className="sheet-autofocus" autoFocus value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Nome, partido ou número" /></label>
        <div className="sheet-results candidate-results" aria-live="polite">{comparisonCandidates.map((item) => <button key={item.id} onClick={() => chooseComparisonCandidate(item.id)}><span className="candidate-number-badge">{item.num}</span><span><strong>{item.nome}</strong><small>{item.partido} · {formatNumber(item.votos)} votos · {formatPct(item.share)}</small></span><span className="sheet-chevron">›</span></button>)}{comparisonCandidates.length === 0 && <p className="sheet-empty">Nenhum candidato encontrado. Revise a busca.</p>}{!candidateQuery.trim() && <p className="sheet-footnote">Mostrando os 30 candidatos mais votados. Digite para buscar em toda a lista.</p>}</div>
      </MobileSheet>}
      <nav className="mobile-tabbar" aria-label="Navegação principal">
        {([["home", "Início"], ["territorio", "Mapa"], ["comparar", "Comparar"], ["zonas", "Zonas"]] as [AtlasView, string][]).map(([id, label]) => <button key={id} aria-current={atlasView === id ? "page" : undefined} onClick={() => navigateView(id)}><ViewIcon view={id} /><span>{label}</span></button>)}
      </nav>
      <footer>
        <p>{base.meta.fonte}. Extração dos boletins em {base.meta.extracao}. Pleito em {base.meta.pleito}.</p>
        <ul>{base.meta.avisos.map((item) => <li key={item}>{item}</li>)}</ul>
        <p>{base.meta.geografias.join(" · ")}</p>
      </footer>
      <ZoneDetailModal detail={zoneDetail} onClose={closeZone} />
      {lastView && !currentView && <div className="app-transition-layer" role="status" aria-live="polite"><span className="map-loading-spinner" /><strong>Atualizando resultados</strong><small>Carregando {cargo.toLocaleLowerCase("pt-BR")}</small></div>}
    </div>
  );
}

function HomePage({ uf, cargo, view, focusedCandidateId, onOpen, onSearch }: { uf: Uf; cargo: string; view: View; focusedCandidateId: number | null; onOpen: (view: AtlasView) => void; onSearch: () => void }) {
  const candidate = focusedCandidateId == null ? view.ranks[0] : view.ranks.find((item) => item.id === focusedCandidateId) ?? view.ranks[0];
  const isFocusedCandidate = focusedCandidateId != null && candidate?.id === focusedCandidateId;
  const attendance = view.kpis.aptos ? (view.kpis.comp / view.kpis.aptos) * 100 : 0;
  return <section className="home-page">
    <section className="home-hero">
      <div className="home-hero-copy">
        <p className="home-kicker"><span /> ATLAS ELEITORAL <i>·</i> 1º TURNO 2022</p>
        <h2>O voto tem<br /><em>um território.</em></h2>
        <p>Explore resultados de {uf === "DF" ? "Brasília e suas regiões" : "São Paulo e seus municípios"}. Compare candidaturas, encontre uma zona e veja os dados por local de votação.</p>
        <div className="home-hero-actions">
          <button className="home-action-primary" onClick={() => onOpen("territorio")}>Explorar o mapa <span aria-hidden="true">↗</span></button>
          <button className="home-action-secondary" onClick={onSearch}><SearchIcon /> Buscar dados</button>
        </div>
        <div className="home-scope-stamp"><span>{uf === "DF" ? "DISTRITO FEDERAL" : "ESTADO DE SÃO PAULO"}</span><b>{cargo}</b></div>
      </div>
      <HomeArtwork uf={uf} />
    </section>

    <section className="home-snapshot" aria-label="Resumo eleitoral">
      <article className="home-leader-tile">
        <span className="home-tile-label">{isFocusedCandidate ? "CANDIDATO EM FOCO" : "LÍDER NOMINAL"} · {view.scopeLabel.toLocaleUpperCase("pt-BR")}</span>
        {candidate ? <><strong className="home-leader-name">{candidate.nome}</strong><span className="home-leader-share">{formatPct(candidate.share)}</span><small>{formatNumber(candidate.votos)} votos nominais para {cargo.toLocaleLowerCase("pt-BR")}</small></> : <><strong className="home-leader-name">Resultado indisponível</strong><small>Não há votos nominais neste recorte.</small></>}
      </article>
      <article className="home-stat-tile"><span className="home-tile-label">ELEITORES APTOS</span><strong>{formatNumber(view.kpis.aptos)}</strong><small>{formatNumber(view.kpis.secoes)} seções apuradas</small></article>
      <article className="home-stat-tile"><span className="home-tile-label">COMPARECIMENTO</span><strong>{formatPct(attendance)}</strong><small>{formatNumber(view.kpis.comp)} eleitoras e eleitores</small></article>
    </section>

    <section className="home-explore">
      <header><div><p className="eyebrow">ESCOLHA SEU PRÓXIMO PASSO</p><h3>O que você quer descobrir?</h3></div><button className="home-search-link" onClick={onSearch}><SearchIcon /><span>Buscar no Atlas</span><b aria-hidden="true">↗</b></button></header>
      <div className="home-shortcuts">
        <button className="home-shortcut shortcut-map" onClick={() => onOpen("territorio")}><span className="shortcut-icon"><ViewIcon view="territorio" /></span><span className="shortcut-copy"><strong>Explore o território</strong><small>Toque numa região para ver o resultado e avançar até as zonas.</small></span><span className="shortcut-arrow" aria-hidden="true">↗</span></button>
        <button className="home-shortcut shortcut-compare" onClick={() => onOpen("comparar")}><span className="shortcut-icon"><ViewIcon view="comparar" /></span><span className="shortcut-copy"><strong>Compare candidatos</strong><small>Veja a diferença de votos e participação entre duas candidaturas.</small></span><span className="shortcut-arrow" aria-hidden="true">↗</span></button>
        <button className="home-shortcut shortcut-zones" onClick={() => onOpen("zonas")}><span className="shortcut-icon"><ViewIcon view="zonas" /></span><span className="shortcut-copy"><strong>Encontre uma zona</strong><small>Pesquise locais, seções, eleitorado e os dois mais votados.</small></span><span className="shortcut-arrow" aria-hidden="true">↗</span></button>
        <button className="home-shortcut shortcut-analysis" onClick={() => onOpen("panorama")}><span className="shortcut-icon"><ViewIcon view="panorama" /></span><span className="shortcut-copy"><strong>Abra a análise completa</strong><small>Gráficos, ranking e outros indicadores eleitorais.</small></span><span className="shortcut-arrow" aria-hidden="true">↗</span></button>
      </div>
    </section>
    <p className="home-source-note">Dados oficiais do TSE · Resultados agregados · Sem cadastro</p>
  </section>;
}

function HomeArtwork({ uf }: { uf: Uf }) {
  return <div className="home-artwork" aria-hidden="true">
    <div className="home-artwork-glow" />
    <svg viewBox="0 0 480 360"><path d="m101 88 51-41 67 14 42-26 59 40 66-10 31 55-22 45 18 54-52 26-11 62-63-17-40 28-52-30-48 8-29-47-53-9-18-46 29-41-12-48z"/><path d="M88 226c50-53 91-48 130-4s72 34 106-21 68-64 108-29"/><circle cx="88" cy="226" r="7"/><circle cx="218" cy="222" r="7"/><circle cx="324" cy="201" r="7"/><circle cx="432" cy="172" r="7"/></svg>
    <span className="home-art-tag">{uf === "DF" ? "33 regiões administrativas" : "645 municípios"}</span>
    <span className="home-art-caption">RESULTADO · TERRITÓRIO · PARTICIPAÇÃO</span>
  </div>;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("modal-open");
    panel.current?.querySelector<HTMLElement>(".sheet-autofocus")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      previous?.focus();
    };
  }, [onClose]);

  return <div className="mobile-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mobile-sheet-grabber" aria-hidden="true" />
      <header><h2>{title}</h2><button className="mobile-sheet-close" aria-label="Fechar" onClick={onClose}>×</button></header>
      {children}
    </section>
  </div>;
}

function SearchIcon() {
  return <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>;
}

function HelpIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-.9.7-1.7 1.1-1.7 2.4M12 16.5v.1" /></svg>;
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "dark"
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.3A8.5 8.5 0 0 1 8.7 3.5 8.5 8.5 0 1 0 20.5 15.3Z" /></svg>;
}

function ViewIcon({ view }: { view: AtlasView }) {
  const paths: Record<AtlasView, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    panorama: <><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M15 14h5m-5 4h5"/></>,
    territorio: <><path d="M3 6.5 9 3l6 3 6-3v14.5L15 21l-6-3-6 3z" /><path d="M9 3v15m6-12v15" /></>,
    comparar: <><path d="M4 19V9m8 10V4m8 15v-7" /><path d="M2 19h20" /></>,
    zonas: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h8m-8 4h5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[view]}</svg>;
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

function exportZonesCsv(rows: { zona: number; regioes: string[]; locais: number; sec: number; aptos: number; comp: number; abs: number; lider: string; votos: number; votosLider: number; percentualLider: number }[], name: string) {
  const header = "zona,regioes,locais,secoes,aptos,comparecimento,abstencoes,votos_nominais,lider_nominal,votos_lider,percentual_lider_nominal";
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const body = rows.map((item) => [item.zona, escape(item.regioes.join(" / ")), item.locais, item.sec, item.aptos, item.comp, item.abs, item.votos, escape(item.lider), item.votosLider, item.percentualLider.toFixed(2)].join(","));
  const blob = new Blob([`\uFEFF${[header, ...body].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `atlas-zonas-${name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
