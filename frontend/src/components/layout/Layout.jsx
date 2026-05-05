import Header  from './Header';

export default function Layout({ children }) {
  return (
    <div className="bg-background text-on-surface font-body-sm min-h-screen">
      <main className="flex flex-col min-h-screen">
        <Header />
        <div className="p-lg space-y-lg max-w-[1440px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
