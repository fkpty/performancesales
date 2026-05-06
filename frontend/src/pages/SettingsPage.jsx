import { useEffect, useState } from 'react';
import { fetchSettings } from '../services/api';
import usePerformanceStore from '../store/performanceStore';

function normalizeRoles(roles) {
  return Array.isArray(roles) ? roles.filter(Boolean).join(', ') : 'Sin roles';
}

function getBootstrapAuth() {
  if (typeof window === 'undefined') {
    return null;
  }

  const user = window.__PERFORMANCE_SALES_AUTH__;
  return user && typeof user === 'object' ? user : null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({ app_version: '1.0.0' });
  const [loading, setLoading] = useState(true);
  const authUser = usePerformanceStore((state) => state.authUser);
  const canUploadReports = usePerformanceStore((state) => state.canUploadReports);
  const bootstrapAuth = getBootstrapAuth();

  useEffect(() => {
    fetchSettings()
      .then(data => { setSettings(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-lg">
      <div>
        <h2 className="font-h2 text-h2 text-on-surface">Ajustes</h2>
        <p className="text-body-sm text-on-surface-variant mt-xs">
          Referencia operativa de la instancia de Performance Sales.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="p-md border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="font-h3 text-h3 text-on-surface">Comportamiento de cargas</h3>
        </div>

        <div className="p-lg space-y-md">
          <ul className="space-y-sm text-body-sm text-on-surface">
            <li>Los reportes soportados son Equipo IT y Equipos Xerox.</li>
            <li>Cada archivo crea un lote nuevo en la base aislada de Performance Sales.</li>
            <li>Si se vuelve a subir el mismo mes y tipo, el lote previo queda archivado y la vista usa la carga mas reciente.</li>
            <li>El historial completo permanece disponible en la sección Cargas.</li>
          </ul>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="p-md border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="font-h3 text-h3 text-on-surface">Diagnostico de acceso</h3>
          <p className="text-body-sm text-on-surface-variant mt-xs">
            Esta tarjeta muestra el estado real que usa la interfaz para decidir si renderiza Subir reportes y Nueva carga.
          </p>
        </div>

        <div className="p-lg space-y-lg text-body-sm">
          <dl className="space-y-xs text-on-surface">
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Usuario resuelto</dt>
              <dd className="text-on-surface font-medium">{authUser?.name || 'Sin usuario'}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Email resuelto</dt>
              <dd className="text-on-surface font-medium">{authUser?.email || 'Sin email'}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Roles resueltos</dt>
              <dd className="text-on-surface font-medium">{normalizeRoles(authUser?.roles)}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Permiso efectivo</dt>
              <dd className={canUploadReports ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                {canUploadReports ? 'Si, puede subir reportes' : 'No, no puede subir reportes'}
              </dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Flag en usuario</dt>
              <dd className="text-on-surface font-medium">
                {String(Boolean(authUser?.can_upload_reports || authUser?.canUploadReports))}
              </dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Bootstrap inyectado</dt>
              <dd className="text-on-surface font-medium">{bootstrapAuth ? 'Disponible' : 'No disponible'}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Email bootstrap</dt>
              <dd className="text-on-surface font-medium">{bootstrapAuth?.email || 'Sin email'}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Roles bootstrap</dt>
              <dd className="text-on-surface font-medium">{normalizeRoles(bootstrapAuth?.roles)}</dd>
            </div>
            <div className="flex gap-md">
              <dt className="text-on-surface-variant w-48">Flag bootstrap</dt>
              <dd className="text-on-surface font-medium">{String(Boolean(bootstrapAuth?.can_upload_reports || bootstrapAuth?.canUploadReports))}</dd>
            </div>
          </dl>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md space-y-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Payload store</p>
            <pre className="text-[12px] leading-5 text-on-surface whitespace-pre-wrap break-words">{JSON.stringify(authUser, null, 2) || 'null'}</pre>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md space-y-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Payload bootstrap</p>
            <pre className="text-[12px] leading-5 text-on-surface whitespace-pre-wrap break-words">{JSON.stringify(bootstrapAuth, null, 2) || 'null'}</pre>
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-sm">Acerca de</h3>
        <dl className="space-y-xs text-body-sm">
          <div className="flex gap-md">
            <dt className="text-on-surface-variant w-36">Aplicación</dt>
            <dd className="text-on-surface font-medium">Performance Sales v{settings.app_version || '1.0.0'}</dd>
          </div>
          <div className="flex gap-md">
            <dt className="text-on-surface-variant w-36">Modo</dt>
            <dd className="text-on-surface font-medium">Instancia local aislada</dd>
          </div>
          <div className="flex gap-md">
            <dt className="text-on-surface-variant w-36">API</dt>
            <dd className="text-on-surface font-medium">/performance-sales/api/performance</dd>
          </div>
          <div className="flex gap-md">
            <dt className="text-on-surface-variant w-36">Tipos</dt>
            <dd className="text-on-surface font-medium">Equipos Xerox, Equipo IT</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
