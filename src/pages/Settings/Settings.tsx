import { useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { AnimatedContent } from '../../components/ui';
import { SettingsNav } from './SettingsNav';
import { SettingsForm } from './SettingsForm';

export const Settings: React.FC = () => {
  const isDirty = useSettingsStore(s => s.isDirty);

  // Warn before closing / reloading with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return (
    <div
      className="settings-layout"
      style={{
        display: 'flex',
        gap: 0,
        minHeight: 'calc(100vh - 104px)',
        position: 'relative',
      }}
    >
      <AnimatedContent distance={6} style={{ flex: '0 0 auto' }}>
        <SettingsNav />
      </AnimatedContent>
      <AnimatedContent delay={90} distance={6} style={{ flex: '1 1 auto' }}>
        <SettingsForm />
      </AnimatedContent>
    </div>
  );
};