import { useEffect, useMemo, useRef, useState } from "react";
import type { ZoneDetail } from "../lib/zone-detail";
import { formatNumber, formatPct, fold } from "../lib/format";

export function ZoneDetailModal({ detail, onClose }: { detail: ZoneDetail | null; onClose: () => void }) {
  const [tab, setTab] = useState<"resultado" | "locais">("resultado");
  const [search, setSearch] = useState("");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
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
  }, [detail?.zona, detail?.uf, onClose]);

  useEffect(() => { setTab("resultado"); setSearch(""); }, [detail?.zona, detail?.uf]);

  const results = useMemo(() => {
    if (!detail) return [];
    const needle = fold(search.trim());
    return detail.resultados.filter((item) => !needle || fold(`${item.nome} ${item.partido} ${item.numero}`).includes(needle));
  }, [detail, search]);
  const locations = useMemo(() => {
    if (!detail) return [];
    const needle = fold(search.trim());
    return detail.locaisDetalhe.filter((item) => !needle || fold(`${item.nome} ${item.bairro} ${item.regiao} ${item.lider} ${item.local}`).includes(needle));
  }, [detail, search]);

  if (!detail) return null;
  const turnout = detail.aptos ? (detail.comparecimento / detail.aptos) * 100 : 0;
  const abstention = detail.aptos ? (detail.abstencoes / detail.aptos) * 100 : 0;

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

        <div className="zone-modal-kpis">
          <ModalKpi label="Seções" value={formatNumber(detail.secoes)} />
          <ModalKpi label="Locais" value={formatNumber(detail.locais)} />
          <ModalKpi label="Eleitores aptos" value={formatNumber(detail.aptos)} />
          <ModalKpi label="Comparecimento" value={formatPct(turnout)} note={formatNumber(detail.comparecimento)} />
          <ModalKpi label="Abstenção" value={formatPct(abstention)} note={formatNumber(detail.abstencoes)} />
          <ModalKpi label="Brancos · nulos" value={`${formatNumber(detail.brancos)} · ${formatNumber(detail.nulos)}`} />
        </div>

        <div className="zone-modal-toolbar">
          <div className="segment" role="tablist" aria-label="Detalhes da zona">
            <button role="tab" aria-selected={tab === "resultado"} onClick={() => { setTab("resultado"); setSearch(""); }}>Resultado na zona</button>
            <button role="tab" aria-selected={tab === "locais"} onClick={() => { setTab("locais"); setSearch(""); }}>Locais de votação</button>
          </div>
          <label className="zone-modal-search">
            <span className="sr-only">{tab === "resultado" ? "Pesquisar candidato" : "Pesquisar local de votação"}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "resultado" ? "Pesquisar candidato ou partido" : "Pesquisar local, bairro ou RA"}
            />
          </label>
        </div>

        {tab === "resultado" ? (
          <div className="zone-results-wrap">
            <div className="zone-result-summary"><span>Votos nominais</span><strong>{formatNumber(detail.votosNominais)}</strong></div>
            <div className="table-wrap">
              <table className="zone-results-table">
               <thead><tr><th>Resultado</th><th>Partido</th><th>Votos</th><th>% nominais</th></tr></thead>
                <tbody>
                  {results.map((item, index) => (
                    <tr key={item.id}>
                      <td data-label="Candidata ou candidato"><span className="zone-rank">{String(index + 1).padStart(2, "0")}</span><span className="zone-candidate">{item.nome}</span><small className="zone-candidate-number">nº {item.numero}</small></td>
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
          <div className="table-wrap zone-locations-wrap">
            <table>
               <thead><tr><th>Local de votação</th><th>Região</th><th>Seções</th><th>Aptos</th><th>Abstenção</th><th>Líder nominal</th></tr></thead>
              <tbody>
                {locations.map((item) => (
                  <tr key={item.id}>
                     <td data-label="Local"><strong>{item.nome}</strong><small className="zone-candidate-number">{item.bairro} · local {item.local}</small></td>
                     <td data-label="Região">{item.regiao}</td>
                     <td data-label="Seções">{item.secoes ? formatNumber(item.secoes) : "—"}</td>
                     <td data-label="Aptos">{formatNumber(item.aptos)}</td>
                     <td data-label="Abstenção">{formatPct(item.aptos ? (item.abstencoes / item.aptos) * 100 : 0)}</td>
                     <td data-label="Líder nominal">{item.lider}<small className="zone-candidate-number">{formatNumber(item.votosLider)} votos · {formatPct(item.percentualLider)}</small></td>
                  </tr>
                ))}
                {locations.length === 0 && <tr><td colSpan={6} className="table-empty">Nenhum local corresponde à busca.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="zone-modal-footnote">{detail.resultadosPorLocalDisponiveis ? "Os votos são apresentados por local e agregam as seções ali instaladas." : "O resultado de candidatos está consolidado para a zona; por local, os dados disponíveis são comparecimento e abstenção."} Percentuais usam votos nominais válidos. Comparecimento e abstenção são contados uma vez por seção.</p>
      </section>
    </div>
  );
}

function ModalKpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="zone-modal-kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
