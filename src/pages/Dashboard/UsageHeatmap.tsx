import React, { useMemo } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { Card, EChart, getCssVar, useThemeVersion } from '../../components/ui';
import type { EChartsOption } from '../../components/ui';

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// Heatmap grid dimensions: 52 weeks × 7 days (Mon–Sun).
const WEEKS = 52;
const DAYS = 7;

/** Format a Date as a local-timezone 'YYYY-MM-DD' string.
 * `toISOString()` returns UTC, which shifts the date by a day in non-UTC
 * timezones and breaks calendar-coordinate matching. */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const UsageHeatmap: React.FC = () => {
  const dailyUsage = useStatsStore(s => s.dailyUsage);
  const themeVersion = useThemeVersion();

  // Date → real request count lookup for the tooltip and coloring.
  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dailyUsage) m.set(d.date, d.count);
    return m;
  }, [dailyUsage]);

  // Max count across the dataset, used to scale the visualMap so low-volume
  // days still get a non-zero color bucket. Falls back to 1 to avoid /0.
  const maxCount = useMemo(
    () => Math.max(...dailyUsage.map(d => d.count), 1),
    [dailyUsage],
  );

  // Resolve the calendar date for a given [col, row] cell:
  //   col WEEKS-1 = current week, col 0 = oldest
  //   row 0 = Monday, row 6 = Sunday (getDay()-1, Sunday→6)
  const resolveCellDate = useMemo(() => {
    return (col: number, row: number): string => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayRow = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const diffDays = (WEEKS - 1 - col) * 7 + (todayRow - row);
      const d = new Date(today);
      d.setDate(today.getDate() - diffDays);
      return formatDateLocal(d);
    };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    // Build [date, count] pairs for every cell. Real request counts come
    // from countByDate; cells without data push 0.
    const data: [string, number][] = [];
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < DAYS; row++) {
        const dateStr = resolveCellDate(col, row);
        const count = countByDate.get(dateStr) ?? 0;
        data.push([dateStr, count]);
      }
    }

    // Calendar range: exactly (WEEKS-1) weeks back to today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - (WEEKS - 1) * 7);
    const range = [formatDateLocal(start), formatDateLocal(today)];

    const heatColors = [
      getCssVar('--bg-base-tertiary') || '#E5E5E5',
      getCssVar('--brand-100') || '#E5EAFF',
      getCssVar('--brand-200') || '#CFD8FF',
      getCssVar('--brand-300') || '#AAB7FF',
      getCssVar('--brand-500') || '#6A6FFF',
      getCssVar('--bg-brand') || '#4B3FE3',
    ];
    const tertiaryText = getCssVar('--text-tertiary') || '#737373';
    const tooltipBg = getCssVar('--bg-tooltip') || '#FFFFFF';
    const tooltipText = getCssVar('--text-default') || '#171717';
    const borderColor = getCssVar('--border-neutral-l1') || 'rgba(115,115,115,0.12)';
    // Match the card surface (not pure white) so empty cells blend in.
    const cellBorder = getCssVar('--bg-base-secondary') || '#F5F5F5';

    return {
      title: {
        text: '调用热力图 — 近一年',
        left: 0,
        top: 0,
        textStyle: {
          fontSize: 13,
          fontWeight: 'bold',
          color: getCssVar('--text-default') || '#171717',
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor,
        borderWidth: 1,
        textStyle: { color: tooltipText, fontSize: 11 },
        formatter: (p: unknown) => {
          const [dateStr] = (p as { value: [string, number] }).value;
          const count = countByDate.get(dateStr) ?? 0;
          const [, m, d] = dateStr.split('-');
          return `${parseInt(m, 10)}月${parseInt(d, 10)}日<br/>${count} 次请求`;
        },
      },
      visualMap: {
        show: true,
        min: 0,
        max: maxCount,
        type: 'continuous',
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 60,
        textStyle: { color: tertiaryText, fontSize: 9 },
        // Smooth gradient from empty-cell color → brand color.
        inRange: {
          color: [
            heatColors[0],
            heatColors[1],
            heatColors[2],
            heatColors[3],
            heatColors[4],
            heatColors[5],
          ],
        },
        // Show "多"/"少" at the ends instead of raw numbers.
        formatter: (v: unknown) => {
          const n = Number(v);
          if (n <= 0) return '少';
          if (n >= maxCount) return '多';
          return '';
        },
      },
      calendar: {
        top: 40,
        left: 0,
        right: 40,
        bottom: 5,
        cellSize: ['auto', 11],
        range,
        itemStyle: {
          color: heatColors[0],
          borderColor: cellBorder,
          borderWidth: 2,
          borderRadius: 4,
        },
        splitLine: { show: false },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: MONTH_NAMES,
          color: tertiaryText,
          fontSize: 9,
          margin: 4,
          align: 'left',
        },
        dayLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data,
          itemStyle: {
            borderRadius: 4,
            borderWidth: 2,
            borderColor: cellBorder,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 4,
              shadowColor: 'rgba(0,0,0,0.2)',
            },
          },
          progressive: 1000,
          animation: false,
        },
      ],
    };
  }, [themeVersion, resolveCellDate, countByDate, maxCount]);

  const hasData = dailyUsage.length > 0;

  return (
    <Card padding="var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      {hasData ? (
        <div style={{ height: 140 }}>
          <EChart option={option} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
          暂无数据
        </div>
      )}
    </Card>
  );
};
