import { SettingsNav } from './SettingsNav';
import { SettingsForm } from './SettingsForm';

export const Settings: React.FC = () => {
  return (
    <div
      className="settings-layout"
      style={{
        display: 'flex',
        gap: 0,
        minHeight: 'calc(100vh - 104px)',
      }}
    >
      <SettingsNav />
      <SettingsForm />
    </div>
  );
};
