export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatPoints(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} p.p.`;
}

export function titleCase(value: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return value
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((part, index) => (index > 0 && small.has(part) ? part : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1)))
    .join(" ");
}

export function cargoSlug(cargo: string): string {
  return fold(cargo).replace(/\s+/g, "-");
}
