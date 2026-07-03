import { useState } from 'react';
import { useAggregationStore } from '../../store/aggregationStore';
import { useProviderStore } from '../../store/providerStore';

const strategyOptions = [
  { value: '轮询 (Round Robin)', label: '轮询 (Round Robin)' },
  { value: '最低延迟', label: '最低延迟' },
  { value: '随机', label: '随机' },
  { value: '顺序', label: '顺序' },
];

const priorityOptions = [
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
];

export const QuickAddPanel: React.FC = () => {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('轮询 (Round Robin)');
  const [priority, setPriority] = useState('P0');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const addAggregation = useAggregationStore(s => s.addAggregation);
  const providers = useProviderStore(s => s.providers);

  // Collect all model names from all providers
  const allModels = providers.flatMap(p => p.models.map(m => ({ provider: p.name, model: m.name })));

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await addAggregation({
        id: Date.now().toString(),
        name: name.trim(),
        models: selectedModels.join(', '),
        strategy,
        priority,
        enabled: true,
      });
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
    <div className="mc-quick-add" style={{
      background: 'var(--bg-base-secondary)', border: '1px solid var(--border-neutral-l1)',
      borderRadius: 'var(--radius-12)', padding: 'var(--spacer-20)',
    }}>
      <h3 className="mc-section__title" style={{
        fontFamily: 'var(--heading-sm-font-family)', fontSize: 'var(--heading-sm-font-size)',
        fontWeight: 'var(--heading-sm-font-weight)', color: 'var(--text-default)',
        margin: '0 0 var(--spacer-16) 0',
      }}>
        快速添加聚合
      </h3>
      <div className="mc-quick-add__form" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacer-16)', flexWrap: 'wrap' }}>
        <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
          <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>聚合名称</label>
          <input className="mc-input" type="text" placeholder="输入聚合名称" value={name} onChange={e => setName(e.target.value)} style={{
            height: 36, padding: '0 var(--spacer-12)', borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)', background: 'var(--bg-white)',
            fontSize: 'var(--body-base-font-size)', color: 'var(--text-default)', outline: 'none',
            boxSizing: 'border-box', width: '100%',
          }} />
        </div>
        <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
          <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>路由策略</label>
          <select className="mc-select" value={strategy} onChange={e => setStrategy(e.target.value)} style={{
            height: 36, padding: '0 var(--spacer-12)', borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)', background: 'var(--bg-white)',
            fontSize: 'var(--body-base-font-size)', color: 'var(--text-default)', outline: 'none',
            cursor: 'pointer', boxSizing: 'border-box', width: '100%',
          }}>
            {strategyOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="mc-quick-add__field" style={{ flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
          <label style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)' }}>优先级</label>
          <select className="mc-select" value={priority} onChange={e => setPriority(e.target.value)} style={{
            height: 36, padding: '0 var(--spacer-12)', borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)', background: 'var(--bg-white)',
            fontSize: 'var(--body-base-font-size)', color: 'var(--text-default)', outline: 'none',
            cursor: 'pointer', boxSizing: 'border-box', width: '100%',
          }}>
            {priorityOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="mc-quick-add__action" style={{ flexShrink: 0 }}>
          <button onClick={handleAdd} style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)', height: 36,
            padding: '0 var(--spacer-16)', borderRadius: 'var(--radius-8)',
            fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--body-base-strong-font-weight)',
            cursor: 'pointer', border: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-overlay-l1)', color: 'var(--text-secondary)',
          }}>
            添加
          </button>
        </div>
      </div>

      {/* Model picker */}
      {allModels.length > 0 && (
        <div style={{ marginTop: 'var(--spacer-16)' }}>
          <label style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--spacer-8)' }}>
            选择包含的模型 {selectedModels.length > 0 && <span style={{ color: 'var(--text-brand)' }}>(已选 {selectedModels.length})</span>}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacer-6)' }}>
            {allModels.map(({ provider, model }) => {
              const selected = selectedModels.includes(model);
              return (
                <span
                  key={model}
                  onClick={() => toggleModel(model)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-4)',
                    height: 28, padding: '0 var(--spacer-10)',
                    borderRadius: 'var(--radius-8)',
                    fontSize: 'var(--body-sm-font-size)',
                    cursor: 'pointer',
                    background: selected ? 'var(--bg-brand-popup)' : 'var(--bg-overlay-l1)',
                    color: selected ? 'var(--text-brand)' : 'var(--text-secondary)',
                    border: selected ? '1px solid var(--bg-brand)' : '1px solid transparent',
                    transition: 'all .12s ease',
                  }}
                  title={provider}
                >
                  {model}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};