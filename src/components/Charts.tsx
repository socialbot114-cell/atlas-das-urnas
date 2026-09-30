import { BarChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart } from "echarts/charts";
import { GridComponent, LegendComponent, RadarComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { Theme } from "../types";
import { formatNumber, formatPct } from "../lib/format";
import type { View } from "../lib/metrics";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  TreemapChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const ink = (theme: Theme) => (theme === "dark" ? "#f4eee4" : "#1c1712");
const muted = (theme: Theme) => (theme === "dark" ? "#b7aa9b" : "#6f6458");
const line = (theme: Theme) => (theme === "dark" ? "rgba(244,238,228,.12)" : "rgba(28,23,18,.1)");
const series = ["#c4492c", "#1e6b58", "#1f4e79", "#b08948", "#6d4c7d", "#c47b2b", "#3e7c9a", "#8c4a3a"];

export function Chart({ option, label }: { option: echarts.EChartsCoreOption; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option, true);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}

function base(theme: Theme) {
  return {
    textStyle: { fontFamily: "Outfit, sans-serif", color: muted(theme) },
    tooltip: {
      backgroundColor: theme === "dark" ? "#221d18" : "#fffaf3",
      borderColor: line(theme),
      textStyle: { color: ink(theme), fontFamily: "Outfit, sans-serif" },
    },
  };
}

export function rankingOption(view: View, theme: Theme, active: number | null): echarts.EChartsCoreOption {
  const rows = view.ranks.slice(0, 10).reverse();
  return {
    ...base(theme),
    grid: { left: 8, right: 18, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatNumber(value) }, splitLine: { lineStyle: { color: line(theme) } } },
    yAxis: { type: "category", data: rows.map((item) => item.nome), axisLabel: { color: ink(theme), width: 110, overflow: "truncate" } },
    series: [{
      type: "bar",
      data: rows.map((item) => ({ value: item.votos, itemStyle: { color: item.id === active ? "#c4492c" : "#1e6b58", borderRadius: [0, 8, 8, 0] } })),
      barWidth: 14,
    }],
  };
}

export function donutOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    series: [{
      type: "pie",
      radius: ["58%", "78%"],
      label: { color: ink(theme), formatter: "{b}\n{d}%" },
      data: view.composition.map((item, index) => ({ name: item.nome, value: item.valor, itemStyle: { color: series[index] } })),
    }],
  };
}

export function treemapOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    series: [{
      type: "treemap",
      roam: false,
      breadcrumb: { show: false },
      label: { color: "#fffaf3", fontFamily: "Outfit, sans-serif" },
      data: view.parties.map((item, index) => ({ name: item.nome, value: item.valor, itemStyle: { color: series[index % series.length] } })),
    }],
  };
}

export function stackedOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    legend: { textStyle: { color: muted(theme) }, top: 0, type: "scroll" },
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: view.stacked.labels, axisLabel: { color: ink(theme), rotate: 35, width: 80, overflow: "truncate" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: line(theme) } }, axisLabel: { formatter: (value: number) => formatNumber(value) } },
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
      itemStyle: { color: "rgba(196,73,44,.72)" },
    }],
  };
}

export function heatOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    grid: { left: 8, right: 12, top: 8, bottom: 46, containLabel: true },
    xAxis: { type: "category", data: view.heatmap.x, axisLabel: { color: ink(theme), rotate: 35, width: 90, overflow: "truncate" } },
    yAxis: { type: "category", data: view.heatmap.y, axisLabel: { color: ink(theme), width: 110, overflow: "truncate" } },
    visualMap: { min: 0, max: 70, calculable: false, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: muted(theme) }, inRange: { color: theme === "dark" ? ["#2a241e", "#f0a35e", "#c4492c"] : ["#f6efe4", "#e7b089", "#c4492c"] } },
    series: [{ type: "heatmap", data: view.heatmap.data, label: { show: view.heatmap.x.length <= 6, color: ink(theme), formatter: (item: { value: number[] }) => formatPct(item.value[2]) } }],
  };
}

export function lineOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: "category", data: view.concentration.map((_, index) => String(index + 1)), name: "candidatos", splitLine: { show: false } },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: line(theme) } } },
    series: [{ type: "line", smooth: true, data: view.concentration.map((item) => Number(item.acumulado.toFixed(1))), areaStyle: { color: "rgba(30,107,88,.18)" }, lineStyle: { color: "#1e6b58", width: 2 }, showSymbol: false }],
  };
}

export function radarOption(view: View, theme: Theme): echarts.EChartsCoreOption {
  return {
    ...base(theme),
    legend: { data: ["Recorte", "Média das regiões"], textStyle: { color: muted(theme) }, bottom: 0 },
    radar: { indicator: view.radar.indicators, radius: "62%", axisName: { color: muted(theme) }, splitLine: { lineStyle: { color: line(theme) } } },
    series: [{
      type: "radar",
      data: [
        { name: "Recorte", value: view.radar.atual, areaStyle: { color: "rgba(196,73,44,.2)" }, lineStyle: { color: "#c4492c" } },
        { name: "Média das regiões", value: view.radar.referencia, lineStyle: { color: "#1e6b58" } },
      ],
    }],
  };
}
