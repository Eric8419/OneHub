import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { desktopApi, type ProviderHealthSnapshot } from '../../lib/desktopApi';
import { AnimatedContent, Card } from '../../components/ui';
import { ProviderCard } from './ProviderCard';
import { Plus, Cpu } from 'lucide-react';
import { useT } from '../../i18n';

export const Providers: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const providers = useProviderStore((s) => s.providers);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const loaded = useProviderStore((s) => s.loaded);
  const [healthMap, setHealthMap] = useState<Record<string, ProviderHealthSnapshot>>({});

  useEffect(() => {
    if (!loaded) loadProviders();
  }, [loaded, loadProviders]);

  const refreshHealth = useCallback(async () => {
    try {
      const map = await desktopApi.getProviderHealth();
      setHealthMap(map);
    } catch (e) {
      console.error('Failed to fetch provider health:', e);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 5000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshHealth();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshHealth]);

  return (
    <div>
      {/* Action Bar */}
      <div
        className="mc-action-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        <p
          className="mc-action-bar__subtitle"
          style={{
            fontSize: 'var(--body-base-font-size)',
            lineHeight: 'var(--body-base-line-height)',
            color: 'var(--text-tertiary)',
            margin: 0,
          }}
        >
          {t('providers.subtitle')}
        </p>
        <button
          className="mc-btn mc-btn--primary"
          onClick={() => navigate('/providers/new')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            height: 36,
            padding: '0 var(--spacer-16)',
            borderRadius: 'var(--radius-8)',
            fontSize: 'var(--body-base-font-size)',
            fontWeight: 'var(--body-base-strong-font-weight)',
            lineHeight: 'var(--body-base-line-height)',
            cursor: 'pointer',
            border: 'none',
            background: 'var(--bg-brand)',
            color: 'var(--text-onbrand)',
          }}
        >
          <Plus size={16} />
          {t('providers.addProvider')}
        </button>
      </div>

      {/* Provider Cards */}
      {providers.length === 0 ? (
        <AnimatedContent delay={80}>
          <Card padding="var(--spacer-48) var(--spacer-24)">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-12)',
                color: 'var(--text-tertiary)',
              }}
            >
              <Cpu size={40} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-secondary)' }}>
                {t('providers.empty.title')}
              </span>
              <span style={{ fontSize: 'var(--body-sm-font-size)' }}>{t('providers.empty.desc')}</span>
            </div>
          </Card>
        </AnimatedContent>
      ) : (
        <div
          className="mc-provider-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--spacer-16)',
          }}
        >
          {providers.map((p, idx) => (
            <AnimatedContent key={p.id} delay={80 + idx * 70}>
              <ProviderCard providerId={p.id} health={healthMap[p.id]} />
            </AnimatedContent>
          ))}
        </div>
      )}
    </div>
  );
};
