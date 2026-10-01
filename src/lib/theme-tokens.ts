import type { Theme } from "../types";

// Explicit theme lookup also works before React commits the root theme attribute.
// The palette lives in CSS; maps and canvas charts consume the same values.
export function themeTokens(theme: Theme) {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(`--palette-${theme}-${name}`).trim();
  const ink = read("ink"), muted = read("muted"), surface = read("surface");
  const accent = read("accent"), pine = read("pine"), gold = read("gold");
  return { ink, muted, surface, accent, pine, gold, line: read("line"), soft: read("soft"),
    series: [accent, pine, read("slate"), gold, read("plum"), read("rose"), read("sage"), read("stone")] };
}
