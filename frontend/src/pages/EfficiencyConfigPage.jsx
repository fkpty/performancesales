import { useEffect, useMemo, useState } from 'react';
import { fetchEfficiencyConfig, saveEfficiencyConfig } from '../services/api';
import usePerformanceStore from '../store/performanceStore';

const SHEET_ORDER = ['sales_productivity'];
const SHEET_TITLES = {
  sales_productivity: 'Sales Productivity',
};

export default function EfficiencyConfigPage() {
  const year = usePerformanceStore((state) => state.year);
  const month = usePerformanceStore((state) => state.month);
  const authUser = usePerformanceStore((state) => state.authUser);
  const canManage = useMemo(() => hasEfficiencyConfigAccess(authUser), [authUser]);

  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    setSuccessMessage('');

    fetchEfficiencyConfig({ year, month })
      .then((response) => {
        if (!active) {
          return;
        }
        setDraft(normalizeDraftConfig(response));
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }
        setError(requestError.message || 'No se pudo cargar la configuracion de eficiencia.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canManage, year, month]);

  if (!canManage) {
    return (
      <section className="bg-error-container border border-red-200 rounded-2xl shadow-sm px-xl py-lg space-y-sm">
        <div className="flex items-center gap-sm text-on-error-container font-semibold">
          <span className="material-symbols-outlined text-error">lock</span>
          Acceso restringido
        </div>
        <p className="text-on-error-container">
          Solo admin, super admin y rrhh pueden editar la configuracion de eficiencia.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-lg">
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-lg space-y-sm">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="font-h2 text-h2 text-on-surface">Configuracion de eficiencia</h2>
            <p className="text-body-sm text-on-surface-variant mt-xs max-w-3xl">
              Ajusta grupos, responsables, salarios, metas y los meses usados en las formulas del workbook.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft || loading || saving}
            className="bg-primary-container text-on-primary font-body-sm px-md py-xs rounded-lg flex items-center gap-xs hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
        <div className="rounded-xl bg-surface-container-low px-md py-sm text-body-sm text-on-surface-variant border border-outline-variant inline-flex items-center gap-sm">
          <span className="material-symbols-outlined text-[18px]">calendar_month</span>
          Configuracion activa para {year}-{String(month).padStart(2, '0')}
        </div>
      </section>

      {loading && (
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm px-lg py-xl text-center text-on-surface-variant">
          Cargando configuracion de eficiencia...
        </section>
      )}

      {error && (
        <section className="bg-red-50 border border-red-200 rounded-2xl px-lg py-md text-red-700">
          {error}
        </section>
      )}

      {successMessage && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl px-lg py-md text-emerald-700">
          {successMessage}
        </section>
      )}

      {!loading && draft && SHEET_ORDER.map((sheetType) => (
        <SheetEditor
          key={sheetType}
          sheetType={sheetType}
          sheet={draft.sheets?.[sheetType]}
          onSheetFieldChange={(field, value) => updateDraft((next) => {
            next.sheets[sheetType][field] = value;
          })}
          onAddGroup={() => updateDraft((next) => {
            next.sheets[sheetType].groups.push(createEmptyGroup(next.sheets[sheetType].groups.length));
          })}
          onRemoveGroup={(groupIndex) => updateDraft((next) => {
            next.sheets[sheetType].groups.splice(groupIndex, 1);
          })}
          onGroupFieldChange={(groupIndex, field, value) => updateDraft((next) => {
            next.sheets[sheetType].groups[groupIndex][field] = value;
          })}
          onAddMember={(groupIndex) => updateDraft((next) => {
            next.sheets[sheetType].groups[groupIndex].members.push(createEmptyMember(next.sheets[sheetType].groups[groupIndex].members.length));
          })}
          onRemoveMember={(groupIndex, memberIndex) => updateDraft((next) => {
            next.sheets[sheetType].groups[groupIndex].members.splice(memberIndex, 1);
          })}
          onMemberFieldChange={(groupIndex, memberIndex, field, value) => updateDraft((next) => {
            next.sheets[sheetType].groups[groupIndex].members[memberIndex][field] = value;
          })}
        />
      ))}
    </div>
  );

  function updateDraft(mutator) {
    setDraft((current) => {
      const next = cloneValue(current);
      mutator(next);
      return normalizeDraftConfig(next);
    });
    setSuccessMessage('');
    setError('');
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await saveEfficiencyConfig({ year, month }, draft);
      setDraft(response);
      setSuccessMessage('La configuracion de eficiencia se guardo correctamente.');
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la configuracion de eficiencia.');
    } finally {
      setSaving(false);
    }
  }
}

function SheetEditor({
  sheetType,
  sheet,
  onSheetFieldChange,
  onAddGroup,
  onRemoveGroup,
  onGroupFieldChange,
  onAddMember,
  onRemoveMember,
  onMemberFieldChange,
}) {
  if (!sheet) {
    return null;
  }

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-md">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">{SHEET_TITLES[sheetType]}</h3>
          <p className="text-[12px] text-on-surface-variant mt-xs">
            Ajustes base del periodo y estructura de grupos para esta hoja.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddGroup}
          className="border border-outline-variant text-on-surface font-body-sm px-md py-xs rounded-lg hover:bg-surface-container-low transition-colors"
        >
          Agregar grupo
        </button>
      </div>

      <div className="p-lg space-y-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
          <Field label="Año base" value={sheet.report_year} onChange={(value) => onSheetFieldChange('report_year', value)} type="number" />
          <Field label="YTD month #" value={sheet.ytd_month_number} onChange={(value) => onSheetFieldChange('ytd_month_number', value)} type="number" />
          <Field label="Config month" value={sheet.config_month} onChange={() => {}} disabled />
        </div>

        {(sheet.groups || []).map((group, groupIndex) => (
          <div key={`${sheetType}-group-${groupIndex}`} className="rounded-2xl border border-outline-variant bg-surface-container-low/20 overflow-hidden">
            <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-md">
              <h4 className="font-semibold text-on-surface">Grupo {groupIndex + 1}</h4>
              <button
                type="button"
                onClick={() => onRemoveGroup(groupIndex)}
                className="text-red-700 text-body-sm hover:underline"
              >
                Eliminar grupo
              </button>
            </div>

            <div className="p-lg space-y-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
                <Field label="Nombre de grupo" value={group.group_name} onChange={(value) => onGroupFieldChange(groupIndex, 'group_name', value)} />
                <Field label="Gerente / responsable" value={group.manager_name} onChange={(value) => onGroupFieldChange(groupIndex, 'manager_name', value)} />
                <Field label="Hub user id (opcional)" value={group.manager_user_id ?? ''} onChange={(value) => onGroupFieldChange(groupIndex, 'manager_user_id', value)} type="number" />
                <Field label="Orden" value={group.sort_order} onChange={(value) => onGroupFieldChange(groupIndex, 'sort_order', value)} type="number" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
                <SelectField
                  label="Fuente YTD"
                  value={group.metrics_source || 'sales_upload'}
                  onChange={(value) => onGroupFieldChange(groupIndex, 'metrics_source', value)}
                  options={METRICS_SOURCE_OPTIONS}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-md">
                <Field label="Salary total amount" value={group.total_salary_amount ?? ''} onChange={(value) => onGroupFieldChange(groupIndex, 'total_salary_amount', value)} type="number" step="0.0001" />
                <Field label="Salary total divisor" value={group.total_salary_divisor} onChange={(value) => onGroupFieldChange(groupIndex, 'total_salary_divisor', value)} type="number" step="0.0001" />
                <Field label="Salary total multiplier" value={group.total_salary_multiplier} onChange={(value) => onGroupFieldChange(groupIndex, 'total_salary_multiplier', value)} type="number" step="0.0001" />
                <SelectField
                  label="Months mode total"
                  value={group.total_salary_months_mode || 'period'}
                  onChange={(value) => onGroupFieldChange(groupIndex, 'total_salary_months_mode', value)}
                  options={MONTH_MODES}
                />
                <Field label="Months custom total" value={group.total_salary_months_custom ?? ''} onChange={(value) => onGroupFieldChange(groupIndex, 'total_salary_months_custom', value)} type="number" />
              </div>

              <div className="flex items-center justify-between gap-md">
                <div>
                  <h5 className="font-medium text-on-surface">Vendedores</h5>
                  <p className="text-[12px] text-on-surface-variant mt-xs">
                    Edita salario, metas y parametros de formula por vendedor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAddMember(groupIndex)}
                  className="border border-outline-variant text-on-surface font-body-sm px-md py-xs rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Agregar vendedor
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-container-low/30 text-on-surface-variant">
                    <tr>
                      {EDITOR_COLUMNS.map((column) => (
                        <th key={column.key} className="px-sm py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">
                          {column.label}
                        </th>
                      ))}
                      <th className="px-sm py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.members || []).map((member, memberIndex) => (
                      <tr key={`${sheetType}-${groupIndex}-${memberIndex}`} className="border-t border-outline-variant/70 align-top">
                        {EDITOR_COLUMNS.map((column) => (
                          <td key={column.key} className="px-sm py-sm min-w-[10rem]">
                            {column.type === 'select' ? (
                              <select
                                value={member[column.key] ?? column.options[0].value}
                                onChange={(event) => onMemberFieldChange(groupIndex, memberIndex, column.key, event.target.value)}
                                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
                              >
                                {column.options.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            ) : column.type === 'checkbox' ? (
                              <label className="inline-flex items-center gap-xs text-on-surface">
                                <input
                                  type="checkbox"
                                  checked={Boolean(member[column.key])}
                                  onChange={(event) => onMemberFieldChange(groupIndex, memberIndex, column.key, event.target.checked)}
                                />
                                Otro
                              </label>
                            ) : (
                              <input
                                type={column.type || 'text'}
                                step={column.step}
                                value={member[column.key] ?? ''}
                                onChange={(event) => onMemberFieldChange(groupIndex, memberIndex, column.key, event.target.value)}
                                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-sm py-sm">
                          <button
                            type="button"
                            onClick={() => onRemoveMember(groupIndex, memberIndex)}
                            className="text-red-700 text-body-sm hover:underline whitespace-nowrap"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {group.metrics_source === 'manual_monthly' && (
                <ManualMetricsSection
                  sheet={sheet}
                  group={group}
                  groupIndex={groupIndex}
                  onMemberFieldChange={onMemberFieldChange}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ManualMetricsSection({ sheet, group, groupIndex, onMemberFieldChange }) {
  const reportYear = normalizeManualMetricYear(sheet.report_year, new Date().getFullYear());
  const [selectedYearInput, setSelectedYearInput] = useState(String(reportYear));
  const [expandedMembers, setExpandedMembers] = useState({});

  const selectedYear = normalizeManualMetricYear(selectedYearInput, reportYear);
  const months = buildManualMetricMonths(selectedYear);
  const members = useMemo(
    () => (group.members || [])
      .map((member, actualMemberIndex) => ({
        member,
        actualMemberIndex,
        memberKey: buildManualMemberCardKey(member, actualMemberIndex),
      }))
      .filter(({ member }) => !isDraftOtherMember(member)),
    [group.members]
  );

  useEffect(() => {
    setSelectedYearInput(String(reportYear));
  }, [reportYear, groupIndex]);

  useEffect(() => {
    setExpandedMembers((current) => {
      const next = {};

      members.forEach(({ memberKey }, index) => {
        if (Object.prototype.hasOwnProperty.call(current, memberKey)) {
          next[memberKey] = current[memberKey];
          return;
        }

        next[memberKey] = index === 0;
      });

      return next;
    });
  }, [members]);

  if (!members.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant px-lg py-lg text-sm text-on-surface-variant bg-surface-container-low/10">
        Agrega vendedores al grupo para capturar manualmente Revenue y Profit por mes.
      </div>
    );
  }

  return (
    <div className="space-y-md">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="space-y-xs min-w-[12rem]">
          <h5 className="font-medium text-on-surface">Captura manual mensual</h5>
          <p className="text-[12px] text-on-surface-variant">
            Primero elige el año a capturar. Luego se habilitan los 12 meses para cada vendedor.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-sm">
          <label className="space-y-xs block min-w-[10rem]">
            <span className="text-[12px] uppercase tracking-wide text-on-surface-variant">Año de captura</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={selectedYearInput}
              onChange={(event) => setSelectedYearInput(event.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
            />
          </label>

          <button
            type="button"
            onClick={() => setExpandedMembers(Object.fromEntries(members.map(({ memberKey }) => [memberKey, true])))}
            className="border border-outline-variant text-on-surface font-body-sm px-md py-xs rounded-lg hover:bg-surface-container-low transition-colors"
          >
            Expandir todos
          </button>

          <button
            type="button"
            onClick={() => setExpandedMembers(Object.fromEntries(members.map(({ memberKey }) => [memberKey, false])))}
            className="border border-outline-variant text-on-surface font-body-sm px-md py-xs rounded-lg hover:bg-surface-container-low transition-colors"
          >
            Contraer todos
          </button>
        </div>
      </div>

      <div className="space-y-md">
        {members.map(({ member, actualMemberIndex, memberKey }, memberIndex) => {
          const summaryMonths = selectedYear === reportYear ? Number(sheet.ytd_month_number || 0) : 12;
          const summary = summarizeManualMetrics(member.manual_metrics || [], selectedYear, summaryMonths);
          const summaryLabel = selectedYear === reportYear
            ? `YTD ${selectedYear} hasta mes ${sheet.ytd_month_number}`
            : `Acumulado ${selectedYear}`;
          const isExpanded = Boolean(expandedMembers[memberKey]);

          return (
            <div key={`${groupIndex}-${memberIndex}-${member.seller_name}`} className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedMembers((current) => ({
                  ...current,
                  [memberKey]: !current[memberKey],
                }))}
                className="w-full px-md py-sm border-b border-outline-variant bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-sm text-left hover:bg-surface-container-low/40 transition-colors"
              >
                <div>
                  <h6 className="font-medium text-on-surface">{member.seller_name || `Vendedor ${memberIndex + 1}`}</h6>
                  <p className="text-[12px] text-on-surface-variant mt-xs">{member.market_segment || 'Sin segmento'} · {summaryLabel}</p>
                </div>

                <div className="flex items-center gap-md ml-auto">
                  <div className="text-[12px] text-on-surface-variant text-right">
                    <div>Revenue: {formatManualMetricTotal(summary.revenue)}</div>
                    <div>Profit: {formatManualMetricTotal(summary.gross_profit)}</div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-container-low/20 text-on-surface-variant">
                      <tr>
                        <th className="px-sm py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">Mes</th>
                        <th className="px-sm py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">Revenue</th>
                        <th className="px-sm py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((month) => {
                        const entry = findManualMetricEntry(member.manual_metrics || [], month.metric_month);

                        return (
                          <tr key={`${member.seller_name}-${month.metric_month}`} className="border-t border-outline-variant/50">
                            <td className="px-sm py-sm whitespace-nowrap text-on-surface">{month.label}</td>
                            <td className="px-sm py-sm min-w-[10rem]">
                              <input
                                type="number"
                                step="0.01"
                                value={entry?.revenue ?? ''}
                                onChange={(event) => onMemberFieldChange(
                                  groupIndex,
                                  actualMemberIndex,
                                  'manual_metrics',
                                  updateManualMetricEntries(member.manual_metrics || [], month.metric_month, 'revenue', event.target.value)
                                )}
                                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
                              />
                            </td>
                            <td className="px-sm py-sm min-w-[10rem]">
                              <input
                                type="number"
                                step="0.01"
                                value={entry?.gross_profit ?? ''}
                                onChange={(event) => onMemberFieldChange(
                                  groupIndex,
                                  actualMemberIndex,
                                  'manual_metrics',
                                  updateManualMetricEntries(member.manual_metrics || [], month.metric_month, 'gross_profit', event.target.value)
                                )}
                                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildManualMemberCardKey(member, actualMemberIndex) {
  const employeeId = String(member?.employee_id || '').trim();
  if (employeeId) {
    return `employee:${employeeId}`;
  }

  const sellerName = String(member?.seller_name || '').trim().toLowerCase();
  if (sellerName) {
    return `seller:${sellerName}:${actualMemberIndex}`;
  }

  return `member:${actualMemberIndex}`;
}

function normalizeManualMetricYear(value, fallbackYear) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) {
    return parsed;
  }

  return Number(fallbackYear) || new Date().getFullYear();
}

function Field({ label, value, onChange, type = 'text', step, disabled = false }) {
  return (
    <label className="space-y-xs block">
      <span className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      <input
        type={type}
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface disabled:opacity-60"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="space-y-xs block">
      <span className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function createEmptyGroup(index) {
  return {
    group_name: `Grupo ${index + 1}`,
    manager_name: '',
    manager_user_id: '',
    metrics_source: 'sales_upload',
    total_salary_amount: '',
    total_salary_divisor: 1,
    total_salary_multiplier: 1,
    total_salary_months_mode: 'period',
    total_salary_months_custom: '',
    sort_order: index,
    members: [],
  };
}

function createEmptyMember(index) {
  return {
    employee_id: '',
    seller_name: '',
    market_segment: '',
    months_in_role_label: '',
    months_in_role_value: '',
    yearly_printing_target: '',
    yearly_it_other_target: '',
    yearly_rental_target: '',
    yearly_total_target: '',
    yearly_gp_target_rate: '',
    plan_months_mode: 'period',
    plan_months_custom: '',
    salary_amount: '',
    salary_divisor: 1,
    salary_multiplier: 1,
    salary_months_mode: 'period',
    salary_months_custom: '',
    manual_metrics: [],
    is_other_row: false,
    sort_order: index,
  };
}

function normalizeDraftConfig(config) {
  if (!config?.sheets) {
    return config;
  }

  SHEET_ORDER.forEach((sheetType) => {
    const sheet = config.sheets?.[sheetType];
    if (!sheet || !Array.isArray(sheet.groups)) {
      return;
    }

    sheet.groups = sheet.groups.map((group, groupIndex) => ({
      ...group,
      metrics_source: normalizeDraftMetricsSource(group.metrics_source),
      sort_order: groupIndex,
      members: sortDraftMembers(group.members || []),
    }));
  });

  return config;
}

function sortDraftMembers(members) {
  return [...members]
    .sort((left, right) => {
      const leftIsOther = isDraftOtherMember(left);
      const rightIsOther = isDraftOtherMember(right);

      if (leftIsOther !== rightIsOther) {
        return leftIsOther ? 1 : -1;
      }

      return Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
    })
    .map((member, index) => ({
      ...member,
      manual_metrics: sortDraftManualMetrics(member.manual_metrics || []),
      is_other_row: isDraftOtherMember(member),
      sort_order: index,
    }));
}

function isDraftOtherMember(member) {
  return Boolean(member?.is_other_row) || String(member?.seller_name || '').trim().toLowerCase() === 'other';
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function hasEfficiencyConfigAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role || '').trim().toLowerCase()) : [];
  return roles.includes('admin') || roles.includes('super_admin') || roles.includes('rrhh');
}

const MONTH_MODES = [
  { value: 'period', label: 'Usar YTD month #' },
  { value: 'months_in_role', label: 'Usar months in sales' },
  { value: 'custom', label: 'Usar valor custom' },
];

const METRICS_SOURCE_OPTIONS = [
  { value: 'sales_upload', label: 'Automatico desde Performance Sales' },
  { value: 'manual_monthly', label: 'Manual por mes y vendedor' },
];

const EDITOR_COLUMNS = [
  { key: 'employee_id', label: 'ID empleado' },
  { key: 'seller_name', label: 'Vendedor' },
  { key: 'market_segment', label: 'Segmento' },
  { key: 'months_in_role_label', label: 'Meses label' },
  { key: 'months_in_role_value', label: 'Meses valor', type: 'number' },
  { key: 'yearly_printing_target', label: 'Meta impresion', type: 'number', step: '0.01' },
  { key: 'yearly_it_other_target', label: 'Meta IT / Otros', type: 'number', step: '0.01' },
  { key: 'yearly_rental_target', label: 'Meta rental', type: 'number', step: '0.01' },
  { key: 'yearly_total_target', label: 'Meta total', type: 'number', step: '0.01' },
  { key: 'yearly_gp_target_rate', label: 'GP rate', type: 'number', step: '0.0001' },
  { key: 'plan_months_mode', label: 'Plan months mode', type: 'select', options: MONTH_MODES },
  { key: 'plan_months_custom', label: 'Plan months custom', type: 'number' },
  { key: 'salary_amount', label: 'Salary amount', type: 'number', step: '0.0001' },
  { key: 'salary_divisor', label: 'Salary divisor', type: 'number', step: '0.0001' },
  { key: 'salary_multiplier', label: 'Salary multiplier', type: 'number', step: '0.0001' },
  { key: 'salary_months_mode', label: 'Salary months mode', type: 'select', options: MONTH_MODES },
  { key: 'salary_months_custom', label: 'Salary months custom', type: 'number' },
  { key: 'is_other_row', label: 'Other', type: 'checkbox' },
];

function buildManualMetricMonths(reportYear) {
  const safeYear = Number(reportYear) || new Date().getFullYear();

  return Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const metricMonth = `${safeYear}-${String(monthNumber).padStart(2, '0')}-01`;

    return {
      metric_month: metricMonth,
      month_number: monthNumber,
      label: new Date(safeYear, index, 1).toLocaleString('es-PA', { month: 'short', year: 'numeric' }),
    };
  });
}

function findManualMetricEntry(manualMetrics, metricMonth) {
  return (manualMetrics || []).find((entry) => entry?.metric_month === metricMonth) || null;
}

function updateManualMetricEntries(manualMetrics, metricMonth, field, rawValue) {
  const nextEntries = Array.isArray(manualMetrics)
    ? manualMetrics.map((entry) => ({ ...entry }))
    : [];
  const index = nextEntries.findIndex((entry) => entry?.metric_month === metricMonth);

  if (index === -1) {
    if (rawValue === '' || rawValue == null) {
      return sortDraftManualMetrics(nextEntries);
    }

    nextEntries.push({
      metric_month: metricMonth,
      revenue: field === 'revenue' ? rawValue : '',
      gross_profit: field === 'gross_profit' ? rawValue : '',
    });

    return sortDraftManualMetrics(nextEntries);
  }

  nextEntries[index] = {
    ...nextEntries[index],
    [field]: rawValue,
  };

  if (isManualMetricEmpty(nextEntries[index])) {
    nextEntries.splice(index, 1);
  }

  return sortDraftManualMetrics(nextEntries);
}

function isManualMetricEmpty(entry) {
  return !hasDraftNumber(entry?.revenue) && !hasDraftNumber(entry?.gross_profit);
}

function hasDraftNumber(value) {
  return value !== '' && value != null && Number.isFinite(Number(value));
}

function sortDraftManualMetrics(manualMetrics) {
  return [...(manualMetrics || [])]
    .filter((entry) => entry?.metric_month)
    .sort((left, right) => String(left.metric_month).localeCompare(String(right.metric_month)));
}

function summarizeManualMetrics(manualMetrics, reportYear, ytdMonthNumber) {
  return (manualMetrics || []).reduce((totals, entry) => {
    const metricMonth = String(entry?.metric_month || '');
    const entryYear = Number(metricMonth.slice(0, 4));
    const entryMonth = Number(metricMonth.slice(5, 7));
    if (entryYear !== Number(reportYear) || entryMonth > Number(ytdMonthNumber || 0)) {
      return totals;
    }

    return {
      revenue: totals.revenue + toDraftNumber(entry?.revenue),
      gross_profit: totals.gross_profit + toDraftNumber(entry?.gross_profit),
    };
  }, { revenue: 0, gross_profit: 0 });
}

function toDraftNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatManualMetricTotal(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeDraftMetricsSource(value) {
  return value === 'manual_monthly' ? 'manual_monthly' : 'sales_upload';
}