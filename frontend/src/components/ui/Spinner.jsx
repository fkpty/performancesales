export default function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'h-4 w-4 border-2' : 'h-8 w-8 border-2';
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className={`${s} border-primary-container border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}
