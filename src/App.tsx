import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/shell/Shell';
import { useSettingsStore } from './store/settingsStore';
import { applyAccentColor } from './lib/colorUtils';

const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const ModelConfig = lazy(() => import('./pages/ModelConfig/ModelConfig').then(m => ({ default: m.ModelConfig })));
const ModelDetailPage = lazy(() => import('./pages/ModelConfig/ModelDetailPage').then(m => ({ default: m.ModelDetailPage })));
const Providers = lazy(() => import('./pages/Providers/Providers').then(m => ({ default: m.Providers })));
const AddProviderPage = lazy(() => import('./pages/Providers/AddProviderPage').then(m => ({ default: m.AddProviderPage })));
const EditProviderPage = lazy(() => import('./pages/Providers/EditProviderPage').then(m => ({ default: m.EditProviderPage })));
const ProviderDetailPage = lazy(() => import('./pages/Providers/ProviderDetailPage').then(m => ({ default: m.ProviderDetailPage })));
const Settings = lazy(() => import('./pages/Settings/Settings').then(m => ({ default: m.Settings })));

function resolveTheme(theme: string): string {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const theme = useSettingsStore(s => s.settings.theme);
  const accentColor = useSettingsStore(s => s.settings.accentColor);
  const loaded = useSettingsStore(s => s.loaded);
  const [, setResolvedTheme] = useState(() => resolveTheme(theme));

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);

    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      applyAccentColor(accentColor, next === 'dark');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, accentColor]);

  useEffect(() => {
    if (loaded) {
      const isDark = resolveTheme(theme) === 'dark';
      applyAccentColor(accentColor, isDark);
    }
  }, [accentColor, loaded, theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Suspense fallback={null}><Dashboard /></Suspense>} />
          <Route path="/models" element={<Suspense fallback={null}><ModelConfig /></Suspense>} />
          <Route path="/models/:modelName" element={<Suspense fallback={null}><ModelDetailPage /></Suspense>} />
          <Route path="/providers" element={<Suspense fallback={null}><Providers /></Suspense>} />
          <Route path="/providers/new" element={<Suspense fallback={null}><AddProviderPage /></Suspense>} />
          <Route path="/providers/:providerId" element={<Suspense fallback={null}><ProviderDetailPage /></Suspense>} />
          <Route path="/providers/:providerId/edit" element={<Suspense fallback={null}><EditProviderPage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
