export default function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const range  = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
    range.push(i);
  }

  pages.push(1);
  if (range[0] > 2) pages.push('…');
  pages.push(...range);
  if (range[range.length - 1] < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  const btn = (label, target, disabled = false) => (
    <button
      key={label}
      disabled={disabled}
      onClick={() => !disabled && typeof target === 'number' && onPage(target)}
      className={`px-2 py-1 min-w-[32px] rounded text-[13px] font-medium transition-colors
        ${target === page
          ? 'bg-primary-container text-on-primary'
          : disabled
          ? 'text-outline-variant cursor-default'
          : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-xs">
      {btn('‹', page - 1, page === 1)}
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`ellipsis-${i}`} className="px-1 text-outline-variant">…</span>
          : btn(p, p, p === page)
      )}
      {btn('›', page + 1, page === totalPages)}
    </div>
  );
}
