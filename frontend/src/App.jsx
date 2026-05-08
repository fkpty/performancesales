import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout        from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import EfficiencyPage from './pages/EfficiencyPage';
import EfficiencyConfigPage from './pages/EfficiencyConfigPage';
import ReportsPage   from './pages/ReportsPage';
import UploadsPage   from './pages/UploadsPage';
import SettingsPage  from './pages/SettingsPage';
import { fetchEfficiencyAccess, initAuthSession } from './services/api';
import usePerformanceStore from './store/performanceStore';
import { canAccessRoute, getDefaultRoute } from './utils/access';

function getBootstrapAuthUser() {
  if (typeof window === 'undefined') {
    return null;
  }

  const user = window.__PERFORMANCE_SALES_AUTH__;
  return user && typeof user === 'object' ? user : null;
}

/**
 * Ping the PHP auth-init endpoint on every app load.
 * In local mode the frontend talks directly to the isolated backend.
 */
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [accessError, setAccessError] = useState('');
  const setAuthUser = usePerformanceStore(s => s.setAuthUser);
  const setAccessContext = usePerformanceStore(s => s.setAccessContext);
  const authUser = usePerformanceStore(s => s.authUser);
  const accessContext = usePerformanceStore(s => s.accessContext);
  const year = usePerformanceStore(s => s.year);
  const month = usePerformanceStore(s => s.month);

  useEffect(() => {
    const bootstrapUser = getBootstrapAuthUser();
    let active = true;

    async function bootstrapAuth() {
      try {
        if (bootstrapUser) {
          setAuthUser(bootstrapUser);
          return;
        }

        const response = await initAuthSession();
        if (active) {
          setAuthUser(response?.user || null);
        }
      } catch {
        if (active) {
          setAuthUser(null);
          setAuthError('No se pudo validar la sesión de PBS Hub para Performance Sales.');
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    bootstrapAuth();

    return () => {
      active = false;
    };
  }, [setAuthUser]);

  useEffect(() => {
    if (!authReady || authError) {
      return undefined;
    }

    let active = true;
    setAccessReady(false);
    setAccessError('');

    fetchEfficiencyAccess({ year, month })
      .then((response) => {
        if (!active) {
          return;
        }
        setAccessContext(response);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAccessContext(null);
        setAccessError(
          error?.response?.data?.error
          || error?.message
          || 'No se pudieron cargar los permisos de navegación.'
        );
      })
      .finally(() => {
        if (active) {
          setAccessReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [authError, authReady, month, setAccessContext, year]);

  if (!authReady || !accessReady) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-lg">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm px-xl py-lg flex items-center gap-md">
          <span className="h-6 w-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="font-medium">Inicializando Performance Sales</p>
            <p className="text-[13px] text-on-surface-variant">Validando la sesión y los permisos antes de cargar la aplicación.</p>
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

  if (accessError) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-lg">
        <div className="max-w-xl bg-error-container border border-red-200 rounded-2xl shadow-sm px-xl py-lg space-y-sm">
          <div className="flex items-center gap-sm text-on-error-container font-semibold">
            <span className="material-symbols-outlined text-error">error</span>
            Error de permisos
          </div>
          <p className="text-on-error-container">{accessError}</p>
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

  const defaultRoute = getDefaultRoute(authUser, accessContext);

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ProtectedRoute routePath="/" redirectTo={defaultRoute}><DashboardPage /></ProtectedRoute>} />
          <Route path="/efficiency" element={<ProtectedRoute routePath="/efficiency" redirectTo={defaultRoute}><EfficiencyPage /></ProtectedRoute>} />
          <Route path="/efficiency-config" element={<ProtectedRoute routePath="/efficiency-config" redirectTo={defaultRoute}><EfficiencyConfigPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute routePath="/reports" redirectTo={defaultRoute}><ReportsPage /></ProtectedRoute>} />
          <Route path="/uploads" element={<ProtectedRoute routePath="/uploads" redirectTo={defaultRoute}><UploadsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute routePath="/settings" redirectTo={defaultRoute}><SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}

function ProtectedRoute({ routePath, redirectTo, children }) {
  const authUser = usePerformanceStore((state) => state.authUser);
  const accessContext = usePerformanceStore((state) => state.accessContext);

  if (canAccessRoute(routePath, authUser, accessContext)) {
    return children;
  }

  return <Navigate to={redirectTo} replace />;
}
