import { useEffect, useState } from 'react';
import { fetchSettings } from '../services/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState({ app_version: '1.0.0' });
  const [loading, setLoading] = useState(true);

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
