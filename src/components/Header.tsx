'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[var(--color-surface)] bg-[var(--color-bg)] px-6 py-4">
      <Link
        href="/"
        className="text-xl font-bold tracking-tight text-white transition-colors hover:text-[var(--color-muted)]"
      >
        TUS Question Bank
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/" className="text-[var(--color-muted)] transition-colors hover:text-white">
            Home
          </Link>
          <Link href="/dashboard" className="text-[var(--color-muted)] transition-colors hover:text-white">
            Dashboard
          </Link>
          <Link href="/quiz/setup" className="text-[var(--color-muted)] transition-colors hover:text-white">
            Start Quiz
          </Link>
        </nav>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface)] font-bold text-white">
          U
        </div>
        <button
          onClick={handleLogout}
          className="text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-white"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
