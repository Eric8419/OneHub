import { useMemo } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { SettingsCategory } from '../../types/settings';
import { Settings, FileText, Shield, Sliders, Globe } from 'lucide-react';
import { useT } from '../../i18n';

const categoryKeys: { key: SettingsCategory; icon: React.ReactNode }[] = [
  { key: 'general', icon: <Settings size={14} /> },
  { key: 'proxy', icon: <Globe size={14} /> },
  { key: 'logging', icon: <FileText size={14} /> },
  { key: 'security', icon: <Shield size={14} /> },
  { key: 'advanced', icon: <Sliders size={14} /> },
];

export const SettingsNav: React.FC = () => {
  const t = useT();
  const activeCategory = useSettingsStore(s => s.activeCategory);
  const setActiveCategory = useSettingsStore(s => s.setActiveCategory);

  const labelMap: Record<SettingsCategory, string> = useMemo(() => ({
    general: t('settings.general'),
    proxy: t('settings.proxy'),
    logging: t('settings.logging'),
    security: t('settings.security'),
    advanced: t('settings.advanced'),
  }), [t]);

  const categories = useMemo(() =>
    categoryKeys.map(c => ({ ...c, label: labelMap[c.key] })),
    [labelMap]
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacer-8)',
        marginBottom: 'var(--spacer-24)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        paddingBottom: 0,
      }}
    >
      {categories.map(cat => {
        const isActive = cat.key === activeCategory;
        return (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-8)',
              padding: 'var(--spacer-10) var(--spacer-20)',
              borderRadius: 'var(--radius-8) var(--radius-8) 0 0',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--bg-brand)' : '2px solid transparent',
              textDecoration: 'none',
              color: isActive ? 'var(--bg-brand)' : 'var(--text-secondary)',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: isActive ? 'var(--font-weight-strong)' : 'var(--body-base-font-weight)',
              lineHeight: 'var(--body-base-line-height)',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'inherit',
              transition: 'color 0.18s cubic-bezier(0.22,1,0.36,1), border-color 0.18s cubic-bezier(0.22,1,0.36,1)',
              marginBottom: '-1px',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-default)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <span
              style={{
                color: isActive ? 'var(--icon-brand)' : 'var(--icon-tertiary)',
                display: 'flex',
                flexShrink: 0,
              }}
            >
              {cat.icon}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
