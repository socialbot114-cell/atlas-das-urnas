import { useEffect, useRef, useState } from "react";
import type { AtlasView } from "../types";
import "./cinema-intro.css";

export const WELCOME_STORAGE_KEY = "atlas-intro-cinema-v1";
const VIEWS: AtlasView[] = ["home", "panorama", "territorio", "comparar", "zonas"];

export function shouldShowWelcome() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const sharedState = ["vista", "uf", "cargo", "municipio", "ra", "candidato", "comparar", "zona", "metrica", "camada"];
  const isSharedAnalysis = sharedState.some((key) => params.has(key));
  try { return !isSharedAnalysis && window.localStorage.getItem(WELCOME_STORAGE_KEY) !== "complete"; }
  catch { return !isSharedAnalysis; }
}

export function markWelcomeComplete() {
  try { window.localStorage.setItem(WELCOME_STORAGE_KEY, "complete"); }
  catch { /* The introduction also works without persistent storage. */ }
}

export function WelcomeIntro({ onFinish }: {
  onFinish: (reason: "completed" | "skipped", destination?: AtlasView, search?: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    document.body.classList.add("cinema-open");
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.type !== "atlas-cinema-finish" || !VIEWS.includes(message.view)) return;
      onFinish(message.reason === "skipped" ? "skipped" : "completed", message.view, message.search === true);
    };
    window.addEventListener("message", receive);
    return () => { document.body.classList.remove("cinema-open"); window.removeEventListener("message", receive); };
  }, [onFinish]);

  return <main className="cinema-intro-shell" aria-label="Introdução ao Atlas das Urnas">
    <iframe ref={frame} className="cinema-intro-frame" title="Introdução cinematográfica ao Atlas das Urnas" src="/intro/cinema.html" onLoad={() => setLoaded(true)} />
    {!loaded && <div className="cinema-intro-loading" role="status">Preparando a introdução…</div>}
  </main>;
}
