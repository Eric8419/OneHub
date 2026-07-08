import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useStatsStore } from '../../store/statsStore';
import { Card } from '../../components/ui';

export const ModelDonutChart: React.FC = () => {
  const modelBreakdown = useStatsStore(s => s.modelBreakdown);
  const totalRequests = useStatsStore(s => s.stats.totalRequests);
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

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
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filteredData.length > 0 ? filteredData : [{ name: '', percentage: 100, color: 'var(--border-neutral-l1)' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={activeIndex !== undefined ? 90 : 80}
                    dataKey="percentage"
                    stroke="none"
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(undefined)}
                  >
                    {(filteredData.length > 0 ? filteredData : [{ name: '', percentage: 100, color: 'var(--border-neutral-l1)' }]).map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.color}
                        style={{
                          transition: 'opacity var(--transition-fast, 0.12s) ease',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-family-metric)',
                    fontSize: 22,
                    fontWeight: 'var(--font-weight-strong)',
                    color: 'var(--text-default)',
                    lineHeight: '28px',
                  }}
                >
                  {totalRequests.toLocaleString()}
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
                      transition: 'opacity var(--transition-fast, 0.12s) ease, background var(--transition-fast, 0.12s) ease',
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
                        transition: 'background var(--transition-fast, 0.12s) ease',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'var(--body-sm-font-size)',
                        color: isHidden ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        textDecoration: isHidden ? 'line-through' : 'none',
                        transition: 'color var(--transition-fast, 0.12s) ease',
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
                    transition: 'opacity var(--transition-fast, 0.12s) ease',
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