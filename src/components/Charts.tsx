import type * as echarts from "echarts/core";
import { themeTokens } from "../lib/theme-tokens";
import type { Theme } from "../types";
import { formatCompact, formatNumber, formatPct } from "../lib/format";
import type { View } from "../lib/metrics";

const ink = (theme: Theme) => themeTokens(theme).ink;
const muted = (theme: Theme) => themeTokens(theme).muted;
const line = (theme: Theme) => themeTokens(theme).line;

export function zonesOption(rows: { zona: number; aptos: number; abs: number }[], theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    grid: { left: 8, right: 14, top: 14, bottom: 34, containLabel: true },
    xAxis: { type: "category", data: rows.map((item) => `ZE ${item.zona}`), axisLabel: { color: muted(theme), rotate: 45 } },
    yAxis: { type: "value", name: "abstenção", max: 100, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: line(theme) } } },
    tooltip: { ...base(theme).tooltip, trigger: "axis", formatter: (items: { dataIndex: number }[]) => {
      const row = rows[items[0]?.dataIndex];
      return row ? `Zona ${row.zona}<br/>Abstenção: ${formatPct(row.aptos ? row.abs / row.aptos * 100 : 0)}<br/>${formatNumber(row.aptos)} aptos` : "";
    } },
    series: [{ type: "bar", data: rows.map((item) => ({ value: Number((item.aptos ? item.abs / item.aptos * 100 : 0).toFixed(1)), itemStyle: { color: series[1], borderRadius: [5, 5, 0, 0] } })) }],
  };
}

function base(theme: Theme) {
  return {
    animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationDuration: 360,
    animationDurationUpdate: 320,
    animationEasing: "cubicOut" as const,
    animationEasingUpdate: "cubicOut" as const,
    textStyle: { fontFamily: "Outfit, sans-serif", color: muted(theme) },
    tooltip: {
      backgroundColor: themeTokens(theme).surface,
      confine: true,
      borderColor: line(theme),
      textStyle: { color: ink(theme), fontFamily: "Outfit, sans-serif" },
    },
  };
}

export function rankingOption(view: View, theme: Theme, active: number | null): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  const rows = view.ranks.slice(0, 10).reverse();
  return {
    ...base(theme),
    grid: { left: 8, right: 18, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", splitNumber: 3, axisLabel: { hideOverlap: true, formatter: (value: number) => formatCompact(value) }, splitLine: { lineStyle: { color: line(theme) } } },
    yAxis: { type: "category", data: rows.map((item) => item.nome), axisLabel: { color: ink(theme), width: 110, overflow: "truncate" } },
    series: [{
      type: "bar",
       data: rows.map((item) => ({ value: item.votos, itemStyle: { color: item.id === active ? series[0] : series[1], borderRadius: [0, 8, 8, 0] } })),
      barWidth: 14,
    }],
  };
}

export function donutOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    series: [{
      type: "pie",
      radius: ["58%", "78%"],
      label: { show: false },
      emphasis: { label: { show: true, position: "center", color: ink(theme), formatter: "{b}\n{d}%" } },
      avoidLabelOverlap: true,
      data: view.composition.map((item, index) => ({ name: item.nome, value: item.valor, itemStyle: { color: series[index] } })),
    }],
  };
}

export function treemapOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    series: [{
      type: "treemap",
      roam: false,
      breadcrumb: { show: false },
       label: { color: themeTokens("light").surface, fontFamily: "Outfit, sans-serif" },
      data: view.parties.map((item, index) => ({ name: item.nome, value: item.valor, itemStyle: { color: series[index % series.length] } })),
    }],
  };
}

export function stackedOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    legend: { textStyle: { color: muted(theme) }, top: 0, type: "scroll" },
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: view.stacked.labels, axisLabel: { color: ink(theme), rotate: 35, width: 80, overflow: "truncate" } },
    yAxis: { type: "value", splitNumber: 3, splitLine: { lineStyle: { color: line(theme) } }, axisLabel: { hideOverlap: true, formatter: (value: number) => formatCompact(value) } },
    series: view.stacked.series.map((item, index) => ({
      name: item.nome,
      type: "bar",
      stack: "votos",
      data: item.dados,
      itemStyle: { color: series[index % series.length] },
    })),
  };
}

export function scatterOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  const max = Math.max(...view.scatter.map((item) => item.size), 1);
  return {
    ...base(theme),
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { name: "Abstenção", nameTextStyle: { color: muted(theme) }, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: line(theme) } } },
    yAxis: { name: "Candidato", nameTextStyle: { color: muted(theme) }, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: line(theme) } } },
    series: [{
      type: "scatter",
      data: view.scatter.map((item) => ({ name: item.name, value: [Number(item.x.toFixed(1)), Number(item.y.toFixed(1)), item.size] })),
      symbolSize: (value: number[]) => 8 + (value[2] / max) * 28,
       itemStyle: { color: series[0], opacity: .72 },
    }],
  };
}

export function heatOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    grid: { left: 8, right: 12, top: 8, bottom: 46, containLabel: true },
    xAxis: { type: "category", data: view.heatmap.x, axisLabel: { color: ink(theme), rotate: 35, width: 90, overflow: "truncate" } },
    yAxis: { type: "category", data: view.heatmap.y, axisLabel: { color: ink(theme), width: 110, overflow: "truncate" } },
     visualMap: { min: 0, max: 70, calculable: false, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: muted(theme) }, inRange: { color: [themeTokens(theme).soft, themeTokens(theme).pine, themeTokens(theme).accent] } },
    series: [{ type: "heatmap", data: view.heatmap.data, label: { show: view.heatmap.x.length <= 6, color: ink(theme), formatter: (item: { value: number[] }) => formatPct(item.value[2]) } }],
  };
}

export function lineOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: "category", data: view.concentration.map((_, index) => String(index + 1)), name: "candidatos", splitLine: { show: false } },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: line(theme) } } },
     series: [{ type: "line", smooth: true, data: view.concentration.map((item) => Number(item.acumulado.toFixed(1))), areaStyle: { color: series[1], opacity: .12 }, lineStyle: { color: series[1], width: 2 }, showSymbol: false }],
  };
}

export function radarOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  return {
    ...base(theme),
    legend: { data: ["Recorte", "Média das regiões"], textStyle: { color: muted(theme) }, bottom: 0 },
    radar: { indicator: view.radar.indicators, radius: "62%", axisName: { color: muted(theme) }, splitLine: { lineStyle: { color: line(theme) } } },
    series: [{
      type: "radar",
      data: [
         { name: "Recorte", value: view.radar.atual, areaStyle: { color: series[0], opacity: .16 }, lineStyle: { color: series[0] } },
         { name: "Média das regiões", value: view.radar.referencia, lineStyle: { color: series[1] } },
      ],
    }],
  };
}

export function comparisonOption(rows: { label: string; first: number; second: number }[], theme: Theme, first: string, second: string): echarts.EChartsCoreOption {
  const { series } = themeTokens(theme);
  const selected = [...rows].sort((a, b) => Math.abs(b.first - b.second) - Math.abs(a.first - a.second)).slice(0, 14).reverse();
  return {
    ...base(theme),
    tooltip: { ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (items: { dataIndex: number }[]) => {
      const row = selected[items[0]?.dataIndex];
      return row ? `${row.label}<br/>${first}: ${formatPct(row.first)}<br/>${second}: ${formatPct(row.second)}<br/>Diferença: ${(row.first - row.second).toFixed(1).replace(".", ",")} p.p.` : "";
    } },
    grid: { left: 12, right: 26, top: 12, bottom: 28, containLabel: true },
    xAxis: { type: "value", name: "p.p.", axisLabel: { formatter: "{value}" }, splitLine: { lineStyle: { color: line(theme) } } },
    yAxis: { type: "category", data: selected.map((item) => item.label), axisLabel: { color: ink(theme), width: 150, overflow: "truncate" } },
    series: [{ type: "bar", data: selected.map((item) => ({ value: Number((item.first - item.second).toFixed(1)), itemStyle: { color: item.first >= item.second ? series[0] : series[1], borderRadius: 4 } })) }],
  };
}
