export default function AccessDeniedState({
  title = 'Sin acceso',
  message = 'Tu usuario no tiene permisos para ver este contenido.',
}) {
  return (
    <section className="bg-error-container border border-red-200 rounded-2xl shadow-sm px-xl py-lg space-y-sm">
      <div className="flex items-center gap-sm text-on-error-container font-semibold">
        <span className="material-symbols-outlined text-error">lock</span>
        {title}
      </div>
      <p className="text-on-error-container">{message}</p>
    </section>
  );
}