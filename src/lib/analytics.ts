export type SwetrixEventMeta = Record<string, string | number | boolean | null>;

interface SwetrixClient {
  track: (event: { ev: string; meta?: SwetrixEventMeta; unique?: boolean }) => void;
}

declare global {
  interface Window {
    swetrix?: SwetrixClient;
    __atlasSwetrixReady?: boolean;
  }
}

interface PendingEvent {
  ev: string;
  meta?: SwetrixEventMeta;
  unique?: boolean;
}

const pending: PendingEvent[] = [];
let ready = typeof window !== "undefined" && window.__atlasSwetrixReady === true;

if (typeof window !== "undefined" && !ready) {
  window.addEventListener("atlas-swetrix-ready", () => {
    ready = true;
    const queued = pending.splice(0);
    for (const event of queued) send(event);
  }, { once: true });
}

function send(event: PendingEvent) {
  try {
    window.swetrix?.track(event);
  } catch {
    // Analytics must never block navigation or the election data UI.
  }
}

export function trackSwetrixEvent(ev: string, meta?: SwetrixEventMeta, unique = false) {
  if (typeof window === "undefined") return;
  const event: PendingEvent = { ev, ...(meta ? { meta } : {}), unique };
  if (ready && window.swetrix) {
    send(event);
    return;
  }
  if (pending.length < 50) pending.push(event);
}
