import { useMemo } from 'react';

export default function HubUserSelect({
  label = 'Usuario',
  users = [],
  assignment = null,
  roleHint = null,
  onChange,
  disabled = false,
  compact = false,
}) {
  const { options, selectedOptionValue, selectedUser } = useMemo(
    () => buildUserSelectState(users, assignment, roleHint),
    [users, assignment, roleHint]
  );

  return (
    <label className="space-y-xs block">
      {label ? (
        <span className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      ) : null}

      <select
        value={selectedOptionValue}
        onChange={(event) => {
          const nextUser = options.find((option) => option.optionValue === event.target.value) || null;
          onChange(nextUser ? toHubUserPayload(nextUser) : null);
        }}
        disabled={disabled}
        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs text-on-surface disabled:opacity-60"
      >
        <option value="">Sin asignar</option>
        {options.map((user) => (
          <option key={user.optionValue} value={user.optionValue}>
            {buildUserOptionLabel(user)}
          </option>
        ))}
      </select>

      <p className={`text-[12px] text-on-surface-variant ${compact ? '' : 'mt-xs'}`}>
        {selectedUser ? buildUserSummary(selectedUser) : 'No hay usuario asignado.'}
      </p>
    </label>
  );
}

function buildUserSelectState(users, assignment, roleHint) {
  const options = sortUsersByRoleHint(users, roleHint).map((user) => ({
    ...user,
    optionValue: `user:${user.id}`,
  }));

  const selectedUser = resolveAssignedUser(options, assignment);
  if (selectedUser && !options.some((user) => user.optionValue === selectedUser.optionValue)) {
    options.unshift(selectedUser);
  }

  return {
    options,
    selectedOptionValue: selectedUser?.optionValue || '',
    selectedUser,
  };
}

function resolveAssignedUser(options, assignment) {
  const assignedId = normalizeIdentifier(assignment?.id);
  const assignedEmail = normalizeEmail(assignment?.email);

  if (assignedId) {
    const byId = options.find((user) => String(user.id) === assignedId);
    if (byId) {
      return byId;
    }
  }

  if (assignedEmail) {
    const byEmail = options.find((user) => normalizeEmail(user.email) === assignedEmail);
    if (byEmail) {
      return byEmail;
    }
  }

  const assignedName = String(assignment?.name || '').trim();
  if (!assignedId && !assignedEmail && !assignedName) {
    return null;
  }

  return {
    id: assignedId || '',
    full_name: assignedName || assignedEmail || 'Usuario actual',
    email: assignedEmail || null,
    roles: [],
    isSynthetic: true,
    optionValue: `current:${assignedId || assignedEmail || normalizeIdentifier(assignedName) || 'unknown'}`,
  };
}

function sortUsersByRoleHint(users, roleHint) {
  return [...(Array.isArray(users) ? users : [])].sort((left, right) => {
    const roleDelta = getRolePriority(left, roleHint) - getRolePriority(right, roleHint);
    if (roleDelta !== 0) {
      return roleDelta;
    }

    const leftName = String(left?.full_name || '').trim();
    const rightName = String(right?.full_name || '').trim();
    const nameDelta = leftName.localeCompare(rightName, 'es', { sensitivity: 'base' });
    if (nameDelta !== 0) {
      return nameDelta;
    }

    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
}

function getRolePriority(user, roleHint) {
  if (!roleHint) {
    return 0;
  }

  return Array.isArray(user?.roles) && user.roles.includes(roleHint) ? 0 : 1;
}

function buildUserOptionLabel(user) {
  const emailText = user?.email ? ` - ${user.email}` : '';
  const rolesText = Array.isArray(user?.roles) && user.roles.length
    ? ` [${user.roles.join(', ')}]`
    : user?.isSynthetic
      ? ' [actual]'
      : '';

  return `${user.full_name}${emailText}${rolesText}`;
}

function buildUserSummary(user) {
  const summaryParts = [`ID ${normalizeIdentifier(user?.id) || 'sin id'}`];

  if (user?.email) {
    summaryParts.push(user.email);
  }

  if (Array.isArray(user?.roles) && user.roles.length) {
    summaryParts.push(user.roles.join(', '));
  }

  if (user?.isSynthetic) {
    summaryParts.push('no disponible en directorio');
  }

  return summaryParts.join(' · ');
}

function toHubUserPayload(user) {
  return {
    id: normalizeIdentifier(user?.id) || '',
    full_name: String(user?.full_name || '').trim(),
    email: normalizeEmail(user?.email) || null,
    roles: Array.isArray(user?.roles) ? user.roles : [],
  };
}

function normalizeIdentifier(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const normalizedEmail = String(value || '').trim().toLowerCase();
  return normalizedEmail || '';
}