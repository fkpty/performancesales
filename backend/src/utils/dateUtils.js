/**
 * Date utilities – all dates stored/returned as UTC YYYY-MM-DD strings.
 */

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/**
 * Try to parse a cell value from Excel into a YYYY-MM-DD string.
 * Handles: JS Date, Excel serial number, ISO string, "DD/MM/YYYY", "MM/DD/YYYY".
 * Returns null if unparseable.
 */
function parseExcelDate(value) {
  if (value == null || value === '') return null;

  // Already a JS Date (SheetJS can return these)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toISO(value);
  }

  // Excel serial number (numeric)
  if (typeof value === 'number') {
    // Excel epoch: Dec 30, 1899; 25569 = Jan 1, 1970
    const utcMs = (value - 25569) * 86400 * 1000;
    const d = new Date(utcMs);
    if (isNaN(d.getTime())) return null;
    return toISO(d);
  }

  // String
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    // ISO 8601
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : toISO(d);
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`);
      return isNaN(d.getTime()) ? null : toISO(d);
    }

    // MM/DD/YYYY (fallback)
    const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mdy) {
      const d = new Date(`${mdy[3]}-${pad(mdy[1])}-${pad(mdy[2])}`);
      return isNaN(d.getTime()) ? null : toISO(d);
    }
  }

  return null;
}

function toISO(d) {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatMonthLabel(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function monthIndex(isoDate) {
  if (!isoDate) return null;
  return parseInt(isoDate.substring(5, 7), 10);
}

function yearOf(isoDate) {
  if (!isoDate) return null;
  return parseInt(isoDate.substring(0, 4), 10);
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const now  = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const end  = new Date(isoDate + 'T00:00:00Z');
  return Math.round((end - now) / 86400000);
}

module.exports = { parseExcelDate, formatMonthLabel, monthIndex, yearOf, daysUntil };
