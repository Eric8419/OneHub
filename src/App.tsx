import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/shell/Shell';
import { useSettingsStore } from './store/settingsStore';

const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const ModelConfig = lazy(() => import('./pages/ModelConfig/ModelConfig').then(m => ({ default: m.ModelConfig })));
const Settings = lazy(() => import('./pages/Settings/Settings').then(m => ({ default: m.Settings })));

function App() {
  const theme = useSettingsStore(s => s.settings.theme);

  // Apply theme to <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Suspense fallback={null}><Dashboard /></Suspense>} />
          <Route path="/models" element={<Suspense fallback={null}><ModelConfig /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
