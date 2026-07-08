import { useMemo } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { SettingsCategory } from '../../types/settings';
import { Settings, FileText, Shield, Sliders, Globe } from 'lucide-react';
import { useT } from '../../i18n';

const categoryKeys: { key: SettingsCategory; icon: React.ReactNode }[] = [
  { key: 'general', icon: <Settings size={16} /> },
  { key: 'proxy', icon: <Globe size={16} /> },
  { key: 'logging', icon: <FileText size={16} /> },
  { key: 'security', icon: <Shield size={16} /> },
  { key: 'advanced', icon: <Sliders size={16} /> },
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
    <nav
      className="settings-categories"
      style={{
        flex: '0 0 220px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacer-2)',
        padding: 'var(--spacer-4) var(--spacer-16) var(--spacer-16) 0',
        borderRight: '1px solid var(--border-neutral-l1)',
      }}
    >
      {categories.map(cat => {
        const isActive = cat.key === activeCategory;
        return (
          <a
            key={cat.key}
            href="#"
            onClick={e => { e.preventDefault(); setActiveCategory(cat.key); }}
            className={`settings-cat-item ${isActive ? 'settings-cat-item--active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-10)',
              padding: 'var(--spacer-10) var(--spacer-12)',
              borderRadius: 'var(--radius-8)',
              borderLeft: isActive ? '3px solid var(--bg-brand)' : '3px solid transparent',
              textDecoration: 'none',
              color: isActive ? 'var(--text-default)' : 'var(--text-secondary)',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: isActive ? 'var(--body-base-strong-font-weight)' : 'var(--body-base-font-weight)',
              lineHeight: 'var(--body-base-line-height)',
              cursor: 'pointer',
              background: isActive ? 'var(--bg-overlay-l2)' : 'transparent',
              transition: 'background-color var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease, border-color var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              style={{
                color: isActive ? 'var(--icon-brand)' : 'var(--icon-secondary)',
                display: 'flex',
                flexShrink: 0,
              }}
            >
              {cat.icon}
            </span>
            <span
              className="settings-cat-label"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cat.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
};
