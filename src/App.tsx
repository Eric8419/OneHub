import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/shell/Shell';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { ModelConfig } from './pages/ModelConfig/ModelConfig';
import { Settings } from './pages/Settings/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/models" element={<ModelConfig />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
