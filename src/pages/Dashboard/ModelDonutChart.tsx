import React, { useMemo, useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { Card, Counter, EChart, getCssVar, useThemeVersion } from '../../components/ui';
import type { EChartsOption } from '../../components/ui';

/** Resolve a `var(--token)` string to its computed value; pass through raw colors. */
function resolveColor(input: string): string {
  const m = input.match(/^var\((--[^)]+)\)$/);
  if (m) return getCssVar(m[1]) || input;
  return input;
}

export const ModelDonutChart: React.FC = () => {
  const modelBreakdown = useStatsStore(s => s.modelBreakdown);
  const totalRequests = useStatsStore(s => s.stats.totalRequests);
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const themeVersion = useThemeVersion();

  const filteredData = modelBreakdown.filter(item => !hiddenModels.has(item.name));
  const showAll = filteredData.length === modelBreakdown.length;

  const toggleModel = (name: string) => {
    setHiddenModels(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const option = useMemo<EChartsOption>(() => {
    const hasData = filteredData.length > 0;
    const borderColor = getCssVar('--bg-base-secondary') || '#F5F5F5';
    const emptyColor = getCssVar('--bg-overlay-l3') || '#D4D4D4';
    const data = hasData
      ? filteredData.map(d => ({
          name: d.name,
          value: d.percentage,
          itemStyle: { color: resolveColor(d.color) },
        }))
      : [{ name: '', value: 100, itemStyle: { color: emptyColor } }];
    return {
      tooltip: {
        trigger: 'item',
        formatter: hasData ? '{b}: {d}%' : '',
        backgroundColor: getCssVar('--bg-tooltip') || '#FFFFFF',
        borderColor: getCssVar('--border-neutral-l1') || '#EEE',
        borderWidth: 1,
        textStyle: {
          color: getCssVar('--text-default') || '#171717',
          fontSize: 12,
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['34', '58'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          silent: !hasData,
          emphasis: {
            scale: hasData,
            scaleSize: 10,
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0,0,0,0.12)',
            },
          },
          itemStyle: {
            borderColor,
            borderWidth: 2,
          },
          animationDuration: 600,
          animationEasing: 'cubicOut',
          data,
        },
      ],
    };
  }, [filteredData, themeVersion]);

  return (
    <Card>
      <div
        style={{
          fontSize: 'var(--heading-xs-font-size)',
          fontWeight: 'var(--heading-xs-font-weight)',
          color: 'var(--text-default)',
          lineHeight: 'var(--heading-xs-line-height)',
          marginBottom: 'var(--spacer-20)',
        }}
      >
        模型调用分布
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {modelBreakdown.length === 0 ? (
          <div style={{ padding: 'var(--spacer-24) 0', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
            暂无数据
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', width: 160, height: 160 }}>
              <EChart option={option} />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-family-metric)',
                    fontSize: 22,
                    fontWeight: 'var(--font-weight-strong)',
                    color: 'var(--text-default)',
                    lineHeight: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Counter
                    value={totalRequests}
                    fontSize={22}
                    gap={1}
                    horizontalPadding={0}
                    gradientHeight={0}
                    gradientFrom="transparent"
                    gradientTo="transparent"
                    textColor="var(--text-default)"
                    fontWeight="var(--font-weight-strong)"
                  />
                </div>
                <div
                  style={{
                    fontSize: 'var(--body-xs-font-size)',
                    color: 'var(--text-tertiary)',
                    lineHeight: 'var(--body-xs-line-height)',
                  }}
                >
                  总请求
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--spacer-8) var(--spacer-16)',
                marginTop: 'var(--spacer-20)',
                width: '100%',
              }}
            >
              {modelBreakdown.map(item => {
                const isHidden = hiddenModels.has(item.name);
                return (
                  <div
                    key={item.name}
                    onClick={() => toggleModel(item.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-8)',
                      cursor: 'pointer',
                      opacity: isHidden ? 0.4 : 1,
                      padding: 'var(--spacer-4) var(--spacer-6)',
                      borderRadius: 'var(--radius-6)',
                      transition: 'opacity var(--transition-fast, 0.12s ease), background var(--transition-fast, 0.12s ease)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 'var(--radius-full)',
                        background: isHidden ? 'var(--border-neutral-l2)' : item.color,
                        flexShrink: 0,
                        transition: 'background var(--transition-fast, 0.12s ease)',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'var(--body-sm-font-size)',
                        color: isHidden ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        textDecoration: isHidden ? 'line-through' : 'none',
                        transition: 'color var(--transition-fast, 0.12s ease)',
                      }}
                    >
                      {item.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-family-metric)',
                        fontSize: 'var(--body-xs-font-size)',
                        color: isHidden ? 'var(--text-disabled)' : 'var(--text-tertiary)',
                        marginLeft: 'auto',
                      }}
                    >
                      {item.percentage}%
                    </span>
                  </div>
                );
              })}
              {!showAll && (
                <div
                  onClick={() => setHiddenModels(new Set())}
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-brand)',
                    cursor: 'pointer',
                    padding: 'var(--spacer-4) 0',
                    transition: 'opacity var(--transition-fast, 0.12s ease)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  显示全部
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
