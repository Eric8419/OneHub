import { AnimatedContent } from '../../components/ui';
import { SettingsNav } from './SettingsNav';
import { SettingsForm } from './SettingsForm';

export const Settings: React.FC = () => {
  return (
    <div
      style={{
        background: 'var(--bg-base-secondary)',
        minHeight: 'calc(100vh - var(--header-height, 0px))',
        margin: '-24px -24px -24px',
        padding: '24px 28px 48px',
        boxSizing: 'border-box',
      }}
    >
      <AnimatedContent distance={6}>
        <SettingsNav />
      </AnimatedContent>
      <AnimatedContent delay={60} distance={6}>
        <SettingsForm />
      </AnimatedContent>
    </div>
  );
};
