import { useEffect, useMemo, useRef, useState } from "react";
import type { ZoneDetail } from "../lib/zone-detail";
import { formatNumber, formatPct, formatPoints, fold } from "../lib/format";
import { trackSwetrixEvent } from "../lib/analytics";
import { useCardMotion } from "../lib/use-card-motion";

export function ZoneDetailModal({ detail, onClose, navigation, onNavigate }: {
  detail: ZoneDetail | null; onClose: () => void;
  navigation?: { previous?: number; next?: number; position: number; total: number };
  onNavigate: (zone: number) => void;
}) {
  const [tab, setTab] = useState<"resultado" | "locais">("resultado");
  const [search, setSearch] = useState("");
  const panel = useRef<HTMLElement>(null);
  const [localSort, setLocalSort] = useState("electorate");
  useCardMotion(panel, Boolean(detail), `${detail?.uf}-${detail?.zona}-${tab}`);

  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab" && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? "resultado" : event.key === "End" ? "locais" : event.target.id === "zone-result-tab" ? "locais" : "resultado";
        setTab(next); setSearch("");
        if (next === "locais") trackSwetrixEvent("zone_locations_opened");
        panel.current?.querySelector<HTMLElement>(next === "locais" ? "#zone-locations-tab" : "#zone-result-tab")?.focus();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      previous?.focus();
    };
  }, [Boolean(detail), onClose]);

  useEffect(() => { setSearch(""); panel.current?.scrollTo({ top: 0, behavior: "auto" }); }, [detail?.zona, detail?.uf]);

  const results = useMemo(() => {
    if (!detail) return [];
    const needle = fold(search.trim());
    return detail.resultados.filter((item) => !needle || fold(`${item.nome} ${item.partido} ${item.numero}`).includes(needle));
  }, [detail, search]);
  const locations = useMemo(() => {
    if (!detail) return [];
    const needle = fold(search.trim());
    return detail.locaisDetalhe.filter((item) => !needle || fold(`${item.nome} ${item.bairro} ${item.regiao} ${item.lider} ${item.segundo} ${item.local}`).includes(needle))
      .sort((a, b) => localSort === "sections" ? b.secoes - a.secoes : localSort === "abstention" ? b.abstencoes / Math.max(b.aptos, 1) - a.abstencoes / Math.max(a.aptos, 1) : localSort === "name" ? a.nome.localeCompare(b.nome, "pt-BR") : b.aptos - a.aptos);
  }, [detail, search, localSort]);

  if (!detail) return null;
  const turnout = detail.aptos ? (detail.comparecimento / detail.aptos) * 100 : 0;
  const abstention = detail.aptos ? (detail.abstencoes / detail.aptos) * 100 : 0;
  const leader = detail.resultados[0];

  function exportDetail() {
    if (!detail) return;
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = tab === "resultado"
      ? [["candidato", "numero", "partido", "votos", "percentual_nominais"], ...results.map((item) => [item.nome, item.numero, item.partido, item.votos, item.percentual])]
      : [["local", "nome", "regiao", "secoes", "aptos", "abstencoes", "votos_por_candidato_disponiveis", "primeiro", "votos_primeiro", "percentual_primeiro", "segundo", "votos_segundo", "percentual_segundo"], ...locations.map((item) => [item.local, item.nome, item.regiao, item.secoes, item.aptos, item.abstencoes, item.resultadosDisponiveis ? "sim" : "nao", item.resultadosDisponiveis ? item.lider : "", item.resultadosDisponiveis ? item.votosLider : "", item.resultadosDisponiveis ? item.percentualLider : "", item.resultadosDisponiveis ? item.segundo : "", item.resultadosDisponiveis ? item.votosSegundo : "", item.resultadosDisponiveis ? item.percentualSegundo : ""])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-${detail.uf}-zona-${detail.zona}-${detail.cargo.replaceAll(" ", "-")}-${tab}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackSwetrixEvent("zone_microdata_exported", { kind: tab });
  }

  return (
    <div className="zone-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} className="zone-modal" role="dialog" aria-modal="true" aria-labelledby="zone-modal-title">
        <header className="zone-modal-header">
          <div>
            <p className="eyebrow">Microdados agregados · {detail.territorio}</p>
            <h2 id="zone-modal-title">Zona {detail.zona}</h2>
            <p className="zone-modal-subtitle">{detail.cargo} · {detail.uf} · dados do 1º turno</p>
          </div>
          <button className="modal-close" aria-label="Fechar detalhes da zona" onClick={onClose}>×</button>
        </header>
        {navigation && <nav className="zone-pager" aria-label="Navegar entre zonas"><button className="ghost" disabled={navigation.previous == null} aria-label="Zona anterior" onClick={() => { if (navigation.previous != null) onNavigate(navigation.previous); }}><span aria-hidden="true">←</span> Anterior</button><span><b>{navigation.position}</b> de {navigation.total} zonas</span><button className="ghost" disabled={navigation.next == null} aria-label="Próxima zona" onClick={() => { if (navigation.next != null) onNavigate(navigation.next); }}>Próxima <span aria-hidden="true">→</span></button></nav>}

        {leader && <div className="zone-leader-summary motion-card" key={`leader-${detail.zona}`}><div><span className="eyebrow">Líder nominal na zona</span><strong>{leader.nome}</strong><small>{leader.partido} · {formatNumber(leader.votos)} votos nominais</small></div><b>{formatPct(leader.percentual)}</b></div>}
        <div className="zone-section-stamp"><span><b>{formatNumber(detail.secoes)}</b> seções agregadas</span><span><b>{formatNumber(detail.locais)}</b> locais de votação</span></div>
        <div className="zone-modal-kpis">
          <ModalKpi label="Eleitores aptos" value={formatNumber(detail.aptos)} />
          <ModalKpi label="Comparecimento" value={formatPct(turnout)} note={formatNumber(detail.comparecimento)} />
          <ModalKpi label="Abstenção" value={formatPct(abstention)} note={formatNumber(detail.abstencoes)} />
          <ModalKpi label="Seções" value={formatNumber(detail.secoes)} />
          <ModalKpi label="Locais" value={formatNumber(detail.locais)} />
          <ModalKpi label="Brancos · nulos" value={`${formatNumber(detail.brancos)} · ${formatNumber(detail.nulos)}`} />
        </div>
        <p className="zone-coverage-note">Fonte: TSE · Candidaturas: % sobre votos nominais. Abstenção: % sobre aptos.{!detail.resultadosPorLocalDisponiveis && " Votação por candidato disponível apenas no total da zona."}</p>

        <div className="zone-modal-toolbar">
          <div className="segment" role="tablist" aria-label="Detalhes da zona">
            <button role="tab" id="zone-result-tab" tabIndex={tab === "resultado" ? 0 : -1} aria-controls={tab === "resultado" ? "zone-result-panel" : undefined} aria-selected={tab === "resultado"} onClick={() => { setTab("resultado"); setSearch(""); }}>Resultado na zona</button>
            <button role="tab" id="zone-locations-tab" tabIndex={tab === "locais" ? 0 : -1} aria-controls={tab === "locais" ? "zone-locations-panel" : undefined} aria-selected={tab === "locais"} onClick={() => { trackSwetrixEvent("zone_locations_opened"); setTab("locais"); setSearch(""); }}>Locais de votação</button>
          </div>
          <label className="zone-modal-search">
            <span className="sr-only">{tab === "resultado" ? "Pesquisar candidato" : "Pesquisar local de votação"}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "resultado" ? "Pesquisar candidato ou partido" : "Pesquisar local, bairro ou RA"}
            />
          </label>
          {tab === "locais" && <label className="local-sort">Ordenar locais<select value={localSort} onChange={(event) => setLocalSort(event.target.value)}><option value="electorate">Mais eleitores</option><option value="sections">Mais seções</option><option value="abstention">Maior abstenção</option><option value="name">Nome do local</option></select></label>}
        </div>

        <div className="microdata-actions"><span>{tab === "resultado" ? `${results.length} candidaturas` : `${locations.length} locais`} neste resultado</span><button className="ghost" onClick={exportDetail}>Exportar microdados CSV ↗</button></div>
        {tab === "resultado" ? (
          <div className="zone-results-wrap" role="tabpanel" id="zone-result-panel" aria-labelledby="zone-result-tab" key={`results-${detail.zona}`}>
            <div className="zone-result-summary"><span>Votos nominais</span><strong>{formatNumber(detail.votosNominais)}</strong></div>
            <div className="table-wrap">
              <table className="zone-results-table">
               <thead><tr><th>Resultado</th><th>Partido</th><th>Votos</th><th>% nominais</th></tr></thead>
                <tbody>
                  {results.map((item) => (
                    <tr className="motion-card" key={item.id}>
                      <td data-label="Candidata ou candidato"><span className="zone-rank">{String(detail.resultados.findIndex((row) => row.id === item.id) + 1).padStart(2, "0")}</span><span className="zone-candidate">{item.nome}</span><small className="zone-candidate-number">nº {item.numero}</small></td>
                      <td data-label="Partido">{item.partido}</td>
                      <td data-label="Votos">{formatNumber(item.votos)}</td>
                      <td data-label="Votos nominais"><div className="zone-share"><span>{formatPct(item.percentual)}</span><i style={{ width: `${Math.min(item.percentual, 100)}%` }} /></div></td>
                    </tr>
                  ))}
                  {results.length === 0 && <tr><td colSpan={4} className="table-empty">Nenhum resultado corresponde à busca.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="table-wrap zone-locations-wrap" role="tabpanel" id="zone-locations-panel" aria-labelledby="zone-locations-tab" key={`locations-${detail.zona}`}>
            <table>
               <thead><tr><th>Local de votação</th><th>Região</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Dois mais votados</th></tr></thead>
              <tbody>
                {locations.map((item) => (
                  <tr className="motion-card" key={item.id}>
                     <td data-label="Local"><strong>{item.nome}</strong><small className="zone-candidate-number">{item.bairro} · local {item.local}</small></td>
                     <td data-label="Região">{item.regiao}</td>
                     <td data-label="Seções">{item.secoes ? formatNumber(item.secoes) : "—"}</td>
                     <td data-label="Aptos">{formatNumber(item.aptos)}</td>
                     <td data-label="Abstenção">{formatPct(item.aptos ? (item.abstencoes / item.aptos) * 100 : 0)}</td>
                     <td data-label="Primeiro e segundo colocados">{item.resultadosDisponiveis ? <div className="local-candidate-rankings">
                       <div className="local-candidate-row"><span className="local-candidate-rank">1</span><span><strong>{item.lider}</strong><small>{formatNumber(item.votosLider)} votos</small></span><b>{formatPct(item.percentualLider)}</b></div>
                        {item.votosSegundo > 0 && <div className="local-candidate-row"><span className="local-candidate-rank">2</span><span><strong>{item.segundo}</strong><small>{formatNumber(item.votosSegundo)} votos</small></span><b>{formatPct(item.percentualSegundo)}</b></div>}
                        <div className="local-duel-track" aria-hidden="true"><i style={{ width: `${item.percentualLider}%` }} /><i style={{ width: `${item.percentualSegundo}%` }} /></div>
                        <small className="local-duel-note">{item.votosSegundo > 0 ? `${formatPoints(item.percentualLider - item.percentualSegundo)} entre os dois` : "Uma candidatura com votos neste local"}</small>
                     </div> : <span className="local-results-unavailable">Votos por candidato indisponíveis neste local.</span>}</td>
                  </tr>
                ))}
                {locations.length === 0 && <tr><td colSpan={6} className="table-empty">Nenhum local corresponde à busca.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <aside className="zone-methodology"><h3>Fonte, cobertura e percentuais</h3><p className="zone-modal-footnote">{detail.resultadosPorLocalDisponiveis ? "Por local, mostramos os dois mais votados e seus percentuais sobre os votos nominais válidos, agregados das seções ali instaladas." : "O resultado de candidatos está consolidado para a zona; por local, os dados disponíveis são comparecimento e abstenção."} Comparecimento e abstenção são contados uma vez por seção.</p><small>TSE · 1º turno de 2022 · Resultados agregados por seção e território.</small></aside>
      </section>
    </div>
  );
}

function ModalKpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="zone-modal-kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
