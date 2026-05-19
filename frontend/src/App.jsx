import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout        from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import PostSalesDashboardPage from './pages/PostSalesDashboardPage';
import EfficiencyPage from './pages/EfficiencyPage';
import EfficiencyConfigPage from './pages/EfficiencyConfigPage';
import ReportsPage   from './pages/ReportsPage';
import UploadsPage   from './pages/UploadsPage';
import SettingsPage  from './pages/SettingsPage';
import { fetchEfficiencyAccess, initAuthSession } from './services/api';
import usePerformanceStore, { buildDateParams } from './store/performanceStore';
import { canAccessRoute, getDefaultRoute } from './utils/access';

const STARTUP_RETRY_DELAYS_MS = [800, 1600, 2400];

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
  const [authError, setAuthError] = useState(null);
  const [accessError, setAccessError] = useState(null);
  const setAuthUser = usePerformanceStore(s => s.setAuthUser);
  const setAccessContext = usePerformanceStore(s => s.setAccessContext);
  const authUser = usePerformanceStore(s => s.authUser);
  const accessContext = usePerformanceStore(s => s.accessContext);
  const year = usePerformanceStore(s => s.year);
  const period = usePerformanceStore(s => s.period);
  const month = usePerformanceStore(s => s.month);
  const quarter = usePerformanceStore(s => s.quarter);
  const startDate = usePerformanceStore(s => s.startDate);
  const endDate = usePerformanceStore(s => s.endDate);

  useEffect(() => {
    const bootstrapUser = getBootstrapAuthUser();
    let active = true;

    async function bootstrapAuth() {
      try {
        if (bootstrapUser) {
          setAuthUser(bootstrapUser);
          return;
        }

        const response = await retryStartupRequest(() => initAuthSession());
        if (active) {
          setAuthUser(response?.user || null);
        }
      } catch (error) {
        if (active) {
          setAuthUser(null);
          setAuthError(buildAuthErrorState(error));
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
    setAccessError(null);

    retryStartupRequest(() => fetchEfficiencyAccess(buildDateParams({ year, period, month, quarter, startDate, endDate })))
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

        if (error?.isAuthError) {
          setAuthUser(null);
          setAuthError(buildAuthErrorState(error));
          setAccessError(null);
          return;
        }

        setAccessError(buildAccessErrorState(error));
      })
      .finally(() => {
        if (active) {
          setAccessReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [authError, authReady, endDate, month, period, quarter, setAccessContext, setAuthUser, startDate, year]);

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
            {authError.title}
          </div>
          <p className="text-on-error-container">{authError.message}</p>
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
            {accessError.title}
          </div>
          <p className="text-on-error-container">{accessError.message}</p>
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
          <Route path="/postventas" element={<ProtectedRoute routePath="/postventas" redirectTo={defaultRoute}><PostSalesDashboardPage /></ProtectedRoute>} />
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

function buildAuthErrorState(error) {
  if (error?.isAvailabilityError) {
    return {
      title: 'Servicio temporalmente no disponible',
      message: error?.message || 'Performance Sales no esta disponible temporalmente.',
    };
  }

  return {
    title: 'Error de autenticacion',
    message: error?.message || 'No se pudo validar la sesion de PBS Hub para Performance Sales.',
  };
}

function buildAccessErrorState(error) {
  if (error?.isAvailabilityError) {
    return {
      title: 'Servicio temporalmente no disponible',
      message: error?.message || 'Performance Sales no esta disponible temporalmente.',
    };
  }

  return {
    title: 'Error de permisos',
    message: error?.message || 'No se pudieron cargar los permisos de navegacion.',
  };
}

async function retryStartupRequest(request) {
  let lastError = null;

  for (let attempt = 0; attempt <= STARTUP_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;

      if (!error?.isAvailabilityError || attempt === STARTUP_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await wait(STARTUP_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
