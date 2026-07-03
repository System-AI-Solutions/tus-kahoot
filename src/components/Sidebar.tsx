'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BeakerIcon,
  BookOpenIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  AcademicCapIcon,
  UserIcon
} from '@heroicons/react/24/outline';

const subjects = [
  { name: 'Anatomy', icon: UserIcon },
  { name: 'Biochemistry', icon: BeakerIcon },
  { name: 'Microbiology', icon: ShieldCheckIcon },
  { name: 'Pathology', icon: HeartIcon },
  { name: 'Pharmacology', icon: BookOpenIcon },
  { name: 'Clinical Sciences', icon: AcademicCapIcon },
];

export function Sidebar() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  const goToSetup = (query: string) => {
    const trimmed = query.trim();
    router.push(trimmed ? `/quiz/setup?q=${encodeURIComponent(trimmed)}` : '/quiz/setup');
  };

  return (
    <aside className="w-64 border-r border-[var(--color-surface)] bg-[var(--color-bg)] p-6 hidden md:block h-full">
      <div className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-4">
          Search
        </h2>
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            goToSetup(searchTerm);
          }}
        >
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search questions..."
            className="w-full rounded-[var(--radius-button)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-[var(--color-body)] placeholder-[var(--color-muted)] outline-none focus:ring-2 focus:ring-[var(--color-muted)] transition-all"
          />
        </form>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Press Enter to build a quiz from matching questions.
        </p>
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-4">
          Categories
        </h2>
        <nav className="space-y-2">
          {subjects.map((subject) => {
            const Icon = subject.icon;
            return (
              <button
                key={subject.name}
                onClick={() => goToSetup('')}
                className="flex w-full items-center gap-3 rounded-[var(--radius-button)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-white"
              >
                <Icon className="h-5 w-5" />
                {subject.name}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
