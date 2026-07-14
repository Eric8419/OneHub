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
    <div>
      <AnimatedContent distance={6}>
        <SettingsNav />
      </AnimatedContent>
      <AnimatedContent delay={60} distance={6}>
        <SettingsForm />
      </AnimatedContent>
    </div>
  );
};
