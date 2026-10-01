import { BarChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart } from "echarts/charts";
import { GridComponent, LegendComponent, RadarComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([BarChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart,
  GridComponent, LegendComponent, RadarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export function Chart({ option, label, onSelect }: { option: echarts.EChartsCoreOption; label: string; onSelect?: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    instance.current = chart;
    chart.on("click", (params) => { if (typeof params.dataIndex === "number") selectRef.current?.(params.dataIndex); });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => { instance.current?.setOption(option, { notMerge: true }); }, [option]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}
