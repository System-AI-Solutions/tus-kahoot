import { Header } from '@/components/Header';

export default function FlaggedLoading() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl animate-pulse space-y-8 p-6">
        <div className="h-8 w-56 rounded bg-[var(--color-surface)]" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
          ))}
        </div>
      </main>
    </div>
  );
}
