import { useState } from 'react';
import { useAggregationStore } from '../../store/aggregationStore';
import { useProviderStore } from '../../store/providerStore';
import { Card, SectionTitle, toast, Dropdown } from '../../components/ui';
import { STRATEGY_OPTIONS, normalizeStrategyKey } from '../../types/aggregation';

const priorityOptions = [
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
];

export const QuickAddPanel: React.FC = () => {
  const [name, setName] = useState('');
  // Store the stable enum key, not a localized label.
  const [strategy, setStrategy] = useState('round-robin');
  const [priority, setPriority] = useState('P0');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [nameError, setNameError] = useState(false);
  const [modelsError, setModelsError] = useState(false);
  const addAggregation = useAggregationStore(s => s.addAggregation);
  const providers = useProviderStore(s => s.providers);

  // Collect all model names from all providers
  const allModels = providers.flatMap(p => p.models.map(m => ({ provider: p.name, model: m.name, key: `${p.id}-${m.id}` })));

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    if (selectedModels.length === 0) {
      setModelsError(true);
      return;
    }
    setNameError(false);
    setModelsError(false);
    try {
      await addAggregation({
        id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
        name: name.trim(),
        models: selectedModels.join(', '),
        // Persist the normalized enum key.
        strategy: normalizeStrategyKey(strategy),
        priority,
        enabled: true,
      });
      toast('聚合规则已添加', 'success');
      setName('');
      setSelectedModels([]);
    } catch (e) {
      console.error('Failed to add aggregation:', e);
    }
  };

  const toggleModel = (modelName: string) => {
    setSelectedModels(prev =>
      prev.includes(modelName)
        ? prev.filter(m => m !== modelName)
        : [...prev, modelName]
    );
  };

  return (
    <Card>
      <SectionTitle>快速添加聚合</SectionTitle>
      <form onSubmit={handleAdd}>
        <div className="mc-quick-add__form" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacer-16)', flexWrap: 'wrap' }}>
          <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
            <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>聚合名称</label>
            <input
              className="mc-input"
              type="text"
              placeholder="输入聚合名称"
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError(false); }}
              style={{
                height: 36, padding: '0 var(--spacer-12)', borderRadius: 'var(--radius-8)',
                border: `1px solid ${nameError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)'}`,
                background: 'var(--bg-white)',
                fontSize: 'var(--body-base-font-size)', color: 'var(--text-default)', outline: 'none',
                boxSizing: 'border-box', width: '100%',
                transition: 'border-color var(--transition-fast, 0.12s) ease',
              }}
            />
            {nameError && (
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                请输入聚合名称
              </span>
            )}
          </div>
          <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
            <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>路由策略</label>
            <Dropdown options={STRATEGY_OPTIONS} value={strategy} onChange={setStrategy} className="mc-select" />
          </div>
          <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
            <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>优先级</label>
            <Dropdown options={priorityOptions} value={priority} onChange={setPriority} className="mc-select" />
          </div>
          <div className="mc-quick-add__action" style={{ flexShrink: 0 }}>
            <button type="submit" style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)', height: 36,
              padding: '0 var(--spacer-16)', borderRadius: 'var(--radius-8)',
              fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--body-base-strong-font-weight)',
              cursor: 'pointer', border: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-overlay-l1)', color: 'var(--text-secondary)',
              fontFamily: 'inherit',
              transition: 'background var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay-l2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
            >
              添加
            </button>
          </div>
        </div>
      </form>

      {/* Model picker */}
      {allModels.length === 0 ? (
        <div style={{ marginTop: 'var(--spacer-16)', fontSize: 'var(--body-sm-font-size)', color: modelsError ? 'var(--status-error-default)' : 'var(--text-tertiary)' }}>
          请先为提供商配置至少一个模型
        </div>
      ) : (
        <div style={{ marginTop: 'var(--spacer-16)' }}>
          <label style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--spacer-8)' }}>
            选择包含的模型 {selectedModels.length > 0 && <span style={{ color: 'var(--text-brand)' }}>(已选 {selectedModels.length})</span>}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacer-6)' }}>
            {allModels.map(({ provider, model, key }) => {
              const selected = selectedModels.includes(model);
              return (
                <button
                  key={key}
                  onClick={() => toggleModel(model)}
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-4)',
                    height: 28, padding: '0 var(--spacer-10)',
                    borderRadius: 'var(--radius-8)',
                    fontSize: 'var(--body-sm-font-size)',
                    cursor: 'pointer',
                    background: selected ? 'var(--bg-brand-popup)' : 'var(--bg-overlay-l1)',
                    color: selected ? 'var(--text-brand)' : 'var(--text-secondary)',
                    border: selected ? '1px solid var(--bg-brand)' : '1px solid transparent',
                    transition: 'all var(--transition-fast, 0.12s) ease',
                    fontFamily: 'inherit',
                  }}
                  title={provider}
                  aria-pressed={selected}
                >
                  {model}
                </button>
              );
            })}
          </div>
          {modelsError && (
            <span style={{ display: 'block', marginTop: 'var(--spacer-8)', fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
              请至少选择一个模型
            </span>
          )}
        </div>
      )}
    </Card>
  );
};
