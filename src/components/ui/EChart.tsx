import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { PieChart, LineChart, HeatmapChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

// Tree-shakeable registration: only the chart types we actually use.
echarts.use([
  PieChart,
  LineChart,
  HeatmapChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  CalendarComponent,
  CanvasRenderer,
]);

export type { EChartsOption };

/**
 * Read a CSS custom property from :root and return the computed value
 * (e.g. `getCssVar('--bg-brand')` → `'#4B3FE3'`). ECharts renders to canvas
 * and cannot consume `var(--…)` references directly, so we resolve them at
 * call time. Reads happen against `document.documentElement` so both light
 * and dark themes (toggled via `data-theme` on `<html>`) are honored.
 */
export function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Subscribe to `data-theme` changes on `<html>` and return a monotonically
 * increasing version number. Use it as a `useMemo` dependency wherever chart
 * options depend on resolved CSS tokens, so charts re-render with the correct
 * colors when the user toggles between light and dark mode.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme' || m.attributeName === 'class') {
          setVersion(v => v + 1);
          return;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);
  return version;
}

export interface EChartProps {
  /** ECharts option object. Re-built by the parent on data/theme change. */
  option: EChartsOption;
  /** Optional style overrides (width/height should be set here or via CSS). */
  style?: React.CSSProperties;
  className?: string;
  /** Called once after the chart instance is created. */
  onReady?: (chart: echarts.ECharts) => void;
}

/**
 * Thin React wrapper around an ECharts instance.
 *
 * - Creates the instance on mount, disposes it on unmount.
 * - Re-applies `option` (with `notMerge: true`) whenever it changes.
 * - Auto-resizes via `ResizeObserver` when the container size changes.
 */
export const EChart: React.FC<EChartProps> = ({ option, style, className, onReady }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Create / dispose the chart instance.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    onReadyRef.current?.(chart);
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Apply option whenever it changes.
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  // Auto-resize with the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(el);
    // Also react to window resize (covers cases where RO doesn't fire).
    const onWinResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, []);

  const mergedStyle = useMemo<React.CSSProperties>(
    () => ({ width: '100%', height: '100%', minHeight: 0, ...style }),
    [style],
  );

  return <div ref={containerRef} className={className} style={mergedStyle} />;
};
