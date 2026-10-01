import { useCallback, useEffect, useRef, useState } from "react";
import type { AtlasView } from "../types";

export const WELCOME_STORAGE_KEY = "atlas-intro-v1";
const STEP_COUNT = 3;

const STEPS = [
  {
    eyebrow: "ATLAS ELEITORAL · 2022",
    title: "Veja a eleição para além do resultado final.",
    description: "Explore como os votos se distribuem no território, compare candidaturas e investigue zonas eleitorais no primeiro turno de 2022.",
    art: "territorio",
    facts: ["Distrito Federal", "São Paulo", "1º turno"],
  },
  {
    eyebrow: "DADOS ABERTOS · FONTES PÚBLICAS",
    title: "Do boletim por seção a uma visão do território.",
    description: "Investigue os microdados oficiais do TSE: do resultado territorial aos votos agregados por zona e local. A fonte, a cobertura e a base de cada percentual acompanham a leitura.",
    art: "dados",
    facts: ["Boletins oficiais · TSE", "Microdados e exportação CSV"],
  },
  {
    eyebrow: "COMECE A EXPLORAR",
    title: "Escolha uma pergunta. O Atlas mostra o caminho.",
    description: "Busque um candidato, partido, município, RA ou zona. Toque no mapa para selecionar uma região; compare duas candidaturas ou abra uma zona para ver os locais.",
    art: "explorar",
    facts: ["Não precisa de cadastro", "Busca e filtros em todas as vistas"],
  },
] as const;

export function shouldShowWelcome() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const sharedState = ["vista", "uf", "cargo", "municipio", "ra", "candidato", "comparar", "zona", "metrica", "camada"];
  const isSharedAnalysis = sharedState.some((key) => params.has(key));
  try {
    return !isSharedAnalysis && window.localStorage.getItem(WELCOME_STORAGE_KEY) !== "complete";
  } catch {
    return !isSharedAnalysis;
  }
}

export function markWelcomeComplete() {
  try {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "complete");
  } catch {
    // The introduction still closes when persistent storage is unavailable.
  }
}

export function WelcomeIntro({ onFinish }: { onFinish: (reason: "completed" | "skipped", destination?: AtlasView) => void }) {
  const [step, setStep] = useState(0);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [destination, setDestination] = useState<AtlasView>("home");
  const methodologyPanel = useRef<HTMLElement>(null);
  const current = STEPS[step];
  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (methodologyOpen) return;
      if (event.key === "ArrowRight") setStep((value) => Math.min(STEP_COUNT - 1, value + 1));
      if (event.key === "ArrowLeft") setStep((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [methodologyOpen]);

  useEffect(() => {
    if (!methodologyOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("modal-open");
    methodologyPanel.current?.querySelector<HTMLButtonElement>(".welcome-info-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMethodology();
      if (event.key !== "Tab" || !methodologyPanel.current) return;
      const controls = [...methodologyPanel.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.classList.remove("modal-open"); previous?.focus(); };
  }, [methodologyOpen, closeMethodology]);

  return (
    <main className="welcome-screen" aria-labelledby="welcome-title">
      <div className="welcome-shell">
        <header className="welcome-topbar">
          <div className="welcome-brand"><img src="/app-icon.svg" alt="" /><span>Atlas das Urnas</span></div>
          <button className="welcome-skip" onClick={() => onFinish("skipped")}>Pular introdução <span aria-hidden="true">↗</span></button>
        </header>

        <section className="welcome-card" data-step={current.art} aria-live="polite">
          <div className="welcome-art"><span className="welcome-art-index">ATLAS / {String(step + 1).padStart(2, "0")}</span><WelcomeArt kind={current.art} /><span className="welcome-art-footnote">TERRITÓRIO · MICRODADOS · CONTEXTO</span></div>
          <div className="welcome-copy">
            <p className="eyebrow">{current.eyebrow}</p>
            <h1 id="welcome-title">{current.title}</h1>
            <p className="welcome-description">{current.description}</p>
            <div className="welcome-facts">{current.facts.map((fact) => <span key={fact}><i aria-hidden="true" />{fact}</span>)}</div>
            {step === 1 && <button className="welcome-methodology-trigger" onClick={() => setMethodologyOpen(true)}><span>Entenda os dados, a tecnologia e os percentuais</span><b aria-hidden="true">↗</b></button>}
            {step === 2 && <div className="welcome-paths" role="group" aria-label="Onde começar"><button aria-pressed={destination === "home"} onClick={() => setDestination("home")}><span>01</span><strong>Visão geral</strong><small>Entenda o recorte</small></button><button aria-pressed={destination === "zonas"} onClick={() => setDestination("zonas")}><span>02</span><strong>Microdados</strong><small>Zonas e locais</small></button><button aria-pressed={destination === "territorio"} onClick={() => setDestination("territorio")}><span>03</span><strong>Território</strong><small>Explore o mapa</small></button></div>}
            <div className="welcome-progress" aria-label={`Etapa ${step + 1} de ${STEP_COUNT}`}>
              <span>{String(step + 1).padStart(2, "0")} <i>/ {String(STEP_COUNT).padStart(2, "0")}</i></span>
              <div>{STEPS.map((item, index) => <button key={item.art} aria-label={`Ir para etapa ${index + 1}`} aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)} />)}</div>
            </div>
            <footer className="welcome-actions">
              {step > 0 && <button className="welcome-back" onClick={() => setStep((value) => value - 1)}>Voltar</button>}
              <button className="welcome-next" onClick={() => step === STEP_COUNT - 1 ? onFinish("completed", destination) : setStep((value) => value + 1)}>{step === STEP_COUNT - 1 ? "Explorar o Atlas" : "Continuar"}<span aria-hidden="true">{step === STEP_COUNT - 1 ? "↗" : "→"}</span></button>
            </footer>
          </div>
        </section>
        <p className="welcome-bottom-note">Resultados oficiais do 1º turno de 2022 · Ferramenta pública, sem cadastro</p>
      </div>
      {methodologyOpen && <div className="welcome-info-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMethodology(); }}>
        <section ref={methodologyPanel} className="welcome-info-sheet" role="dialog" aria-modal="true" aria-labelledby="welcome-methodology-title">
          <div className="welcome-info-grabber" aria-hidden="true" />
          <header><h2 id="welcome-methodology-title">Entenda os dados</h2><button className="welcome-info-close" aria-label="Fechar detalhes dos dados" onClick={closeMethodology}>×</button></header>
          <div className="welcome-info-content">
            <p><strong>“Microdados” aqui são resultados agregados:</strong> votos e eleitorado por seção e território, sem registros que identifiquem a escolha de cada eleitor.</p>
            <p>Percentuais de candidatos usam votos nominais válidos; comparecimento e abstenção são calculados sobre eleitores aptos. Mapas usam limites do IBGE em SP e a camada IPE/DF de 2019 no DF. Seis locais do DF sem coordenadas foram associados por endereço e continuam nos totais.</p>
            <p>Mapas interativos usam MapLibre; os gráficos, ECharts. Votos por candidato em locais existem para Presidente em SP e para Presidente, Governador e Senador no DF. Para outros cargos, o Atlas indica quando o detalhe local não está disponível.</p>
          </div>
          <button className="welcome-info-done" onClick={closeMethodology}>Entendi</button>
        </section>
      </div>}
    </main>
  );
}

function WelcomeArt({ kind }: { kind: (typeof STEPS)[number]["art"] }) {
  if (kind === "territorio") return <div className="welcome-map-art" aria-hidden="true">
    <div className="welcome-map-grid" />
    <svg viewBox="0 0 480 350" role="presentation"><path className="welcome-map-shape" d="m77 86 62-43 75 18 34-23 61 27 79-7 30 57-27 42 22 47-49 33-6 69-71-17-41 29-54-28-46 12-36-43-56-3-23-51-41-22 34-47-15-45z"/><path className="welcome-map-route" d="M105 211c61-59 81 40 136-8s72-75 133-17"/><circle cx="105" cy="211" r="7"/><circle cx="241" cy="203" r="7"/><circle cx="374" cy="186" r="7"/></svg>
    <div className="welcome-map-label label-one">DISTRITO FEDERAL <b>33 RAs</b></div><div className="welcome-map-label label-two">SÃO PAULO <b>645 municípios</b></div>
    <div className="welcome-map-scale"><span>MENOR</span><i /><span>MAIOR</span></div>
  </div>;

  if (kind === "dados") return <div className="welcome-data-art" aria-hidden="true">
    <div className="data-card data-source"><span className="data-card-icon">TSE</span><span><b>Boletim por seção</b><small>Resultado oficial apurado</small></span><i>↗</i></div>
    <div className="data-flow"><i /><i /><i /></div>
    <div className="data-aggregation"><span className="data-aggregation-mark"><b /><b /><b /><b /></span><span><b>Contagens agregadas</b><small>Organizadas por território</small></span></div>
    <div className="data-destinations"><span>Município</span><span>Zona</span><span>Local</span></div>
    <div className="data-integrity"><span aria-hidden="true">✓</span><span><b>Sem dados individuais de eleitores</b><small>Votos apresentados em totais agregados</small></span></div>
  </div>;

  return <div className="welcome-explore-art" aria-hidden="true">
    <div className="explore-search"><span>⌕</span>Buscar candidato, município, RA ou zona<i>↵</i></div>
    <div className="explore-pills"><span>Distrito Federal</span><span>Presidente</span><span>1º turno</span></div>
    <div className="explore-map-preview"><div className="explore-outline" /><span className="explore-dot dot-a" /><span className="explore-dot dot-b" /><span className="explore-dot dot-c" /><span className="explore-selected"><b>Taguatinga</b><small>Toque para explorar</small></span></div>
    <div className="explore-bottom-nav"><span>⌂ <small>Início</small></span><span>◇ <small>Mapa</small></span><span>▥ <small>Comparar</small></span><span>▤ <small>Zonas</small></span><span>▦ <small>Análise</small></span></div>
  </div>;
}
