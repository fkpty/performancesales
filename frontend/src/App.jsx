import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout        from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ReportsPage   from './pages/ReportsPage';
import UploadsPage   from './pages/UploadsPage';
import SettingsPage  from './pages/SettingsPage';
import { initAuthSession } from './services/api';

/**
 * Ping the PHP auth-init endpoint on every app load.
 * In local mode the frontend talks directly to the isolated backend.
 */
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    initAuthSession().catch(() => {
      setAuthError('No se pudo validar la sesión de PBS Hub para Performance Sales.');
    }).finally(() => {
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-lg">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm px-xl py-lg flex items-center gap-md">
          <span className="h-6 w-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="font-medium">Inicializando Performance Sales</p>
            <p className="text-[13px] text-on-surface-variant">Validando la sesión antes de consultar el dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-lg">
        <div className="max-w-xl bg-error-container border border-red-200 rounded-2xl shadow-sm px-xl py-lg space-y-sm">
          <div className="flex items-center gap-sm text-on-error-container font-semibold">
            <span className="material-symbols-outlined text-error">error</span>
            Error de autenticación
          </div>
          <p className="text-on-error-container">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-md py-xs bg-primary-container text-on-primary rounded-lg font-body-sm hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/"         element={<DashboardPage />} />
          <Route path="/reports"  element={<ReportsPage />} />
          <Route path="/uploads"  element={<UploadsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Catch-all */}
          <Route path="*"         element={<DashboardPage />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
