import { useEffect, useState } from 'react';
import HubUserSelect from '../components/ui/HubUserSelect';
import { fetchSettings, fetchSettingsUsers, saveSettings } from '../services/api';
import usePerformanceStore from '../store/performanceStore';
import { hasAdministrativeRole } from '../utils/access';

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
  const [availableUsers, setAvailableUsers] = useState([]);
  const [fullViewUsers, setFullViewUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingFullViewUsers, setSavingFullViewUsers] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const authUser = usePerformanceStore((state) => state.authUser);
  const canUploadReports = usePerformanceStore((state) => state.canUploadReports);
  const bootstrapAuth = getBootstrapAuth();
  const canManageFullViewAccess = hasAdministrativeRole(authUser);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchSettings(),
      canManageFullViewAccess ? fetchSettingsUsers() : Promise.resolve({ users: [] }),
    ])
      .then(([settingsResponse, usersResponse]) => {
        if (!active) {
          return;
        }

        setSettings(settingsResponse);
        setFullViewUsers(normalizeFullViewUsers(settingsResponse?.full_view_access_users));
        setAvailableUsers(Array.isArray(usersResponse?.users) ? usersResponse.users : []);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setSettingsError('No se pudieron cargar todos los ajustes de Performance Sales.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canManageFullViewAccess]);

  const handleAddFullViewUser = () => {
    setSettingsError('');
    setSettingsSuccess('');
    setFullViewUsers((currentUsers) => [...currentUsers, createEmptyFullViewUser()]);
  };

  const handleUpdateFullViewUser = (index, user) => {
    setSettingsError('');
    setSettingsSuccess('');
    setFullViewUsers((currentUsers) => currentUsers.map((entry, entryIndex) => (
      entryIndex === index ? normalizeFullViewUser(user) : entry
    )));
  };

  const handleRemoveFullViewUser = (index) => {
    setSettingsError('');
    setSettingsSuccess('');
    setFullViewUsers((currentUsers) => currentUsers.filter((_, entryIndex) => entryIndex !== index));
  };

  const handleSaveFullViewUsers = async () => {
    const normalizedUsers = normalizeFullViewUsers(fullViewUsers);

    try {
      setSavingFullViewUsers(true);
      setSettingsError('');
      setSettingsSuccess('');
      await saveSettings({ full_view_access_users: normalizedUsers });
      setSettings((currentSettings) => ({
        ...currentSettings,
        full_view_access_users: normalizedUsers,
      }));
      setFullViewUsers(normalizedUsers);
      setSettingsSuccess('Se guardaron los permisos de visualización total.');
    } catch (error) {
      setSettingsError(
        error?.response?.data?.error
        || error?.message
        || 'No se pudieron guardar los permisos de visualización total.'
      );
    } finally {
      setSavingFullViewUsers(false);
    }
  };

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

      {settingsError && (
        <section className="bg-red-50 border border-red-200 rounded-2xl px-lg py-md text-red-700">
          {settingsError}
        </section>
      )}

      {settingsSuccess && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl px-lg py-md text-emerald-700">
          {settingsSuccess}
        </section>
      )}

      {canManageFullViewAccess && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="p-md border-b border-outline-variant bg-surface-container-low/50 flex flex-wrap items-start justify-between gap-md">
            <div>
              <h3 className="font-h3 text-h3 text-on-surface">Acceso de visualización total</h3>
              <p className="text-body-sm text-on-surface-variant mt-xs max-w-3xl">
                Estos usuarios ven Panel, Eficiencia, Detalle y Cargas con alcance completo, pero sin Configuración de eficiencia, Ajustes ni botones para cargar o subir reportes.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddFullViewUser}
              className="border border-outline-variant text-on-surface font-body-sm px-md py-xs rounded-lg hover:bg-surface-container-low transition-colors"
            >
              Agregar usuario
            </button>
          </div>

          <div className="p-lg space-y-md">
            {fullViewUsers.length === 0 && (
              <div className="rounded-xl border border-dashed border-outline-variant px-md py-md text-body-sm text-on-surface-variant bg-surface-container-low/10">
                No hay usuarios con este permiso especial.
              </div>
            )}

            {fullViewUsers.map((user, index) => (
              <div key={`${user.id || user.email || 'full-view'}-${index}`} className="rounded-xl border border-outline-variant bg-surface-container-low/20 p-md space-y-sm">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-on-surface">Usuario con visualización total #{index + 1}</p>
                    <p className="text-[12px] text-on-surface-variant mt-xs">
                      El permiso no otorga Configuración de eficiencia, Ajustes ni acciones de carga.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFullViewUser(index)}
                    className="text-red-700 text-body-sm hover:underline"
                  >
                    Eliminar
                  </button>
                </div>

                <HubUserSelect
                  label="Usuario autorizado"
                  users={availableUsers}
                  assignment={{
                    id: user?.id,
                    name: user?.full_name,
                    email: user?.email,
                  }}
                  onChange={(selectedUser) => handleUpdateFullViewUser(index, selectedUser)}
                />
              </div>
            ))}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveFullViewUsers}
                disabled={savingFullViewUsers}
                className="bg-primary-container text-on-primary font-body-sm px-md py-xs rounded-lg flex items-center gap-xs hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {savingFullViewUsers ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </div>
          </div>
        </div>
      )}

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

function createEmptyFullViewUser() {
  return {
    id: '',
    full_name: '',
    email: null,
  };
}

function normalizeFullViewUsers(value) {
  const sourceUsers = Array.isArray(value)
    ? value
    : parseFullViewUsers(value);
  const seen = new Set();

  return sourceUsers.reduce((users, entry) => {
    const normalizedUser = normalizeFullViewUser(entry);
    if (!normalizedUser || (!normalizedUser.id && !normalizedUser.email)) {
      return users;
    }

    const uniqueKey = `${normalizedUser.id || ''}:${normalizedUser.email || ''}`;
    if (seen.has(uniqueKey)) {
      return users;
    }

    seen.add(uniqueKey);
    users.push(normalizedUser);
    return users;
  }, []);
}

function parseFullViewUsers(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function normalizeFullViewUser(user) {
  const normalizedId = String(user?.id || '').trim();
  const normalizedEmail = String(user?.email || '').trim().toLowerCase() || null;
  const fullName = String(user?.full_name || user?.name || '').trim();

  if (!normalizedId && !normalizedEmail) {
    return createEmptyFullViewUser();
  }

  return {
    id: normalizedId,
    full_name: fullName || normalizedEmail || normalizedId,
    email: normalizedEmail,
  };
}
