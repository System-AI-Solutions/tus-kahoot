'use client';

import Link from 'next/link';
import { 
  BeakerIcon, 
  AcademicCapIcon, 
  DocumentTextIcon, 
  ArrowRightIcon,
  PlayIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useStartQuiz } from '@/lib/quiz/use-start-quiz';

const mainCards = [
  {
    title: 'Basic Sciences',
    count: '1,248',
    description: 'Anatomy, Bio, Micro, Path, Pharm',
    icon: BeakerIcon,
    color: 'text-[var(--color-answer-b)]',
    bg: 'bg-[var(--color-answer-b)]/10',
  },
  {
    title: 'Clinical Sciences',
    count: '2,819',
    description: 'Internal Med, Surgery, Peds, OBGYN',
    icon: AcademicCapIcon,
    color: 'text-[var(--color-correct-banner)]',
    bg: 'bg-[var(--color-correct-banner)]/10',
  },
  {
    title: 'All Questions',
    count: '4,067',
    description: 'Total questions in your bank',
    icon: DocumentTextIcon,
    color: 'text-[var(--color-answer-e)]',
    bg: 'bg-[var(--color-answer-e)]/10',
  },
];

export function DashboardCards() {
  const { start, loading, error } = useStartQuiz();

  const handleStartPractice = async () => {
    await start({
      section: 'all',
      questionCount: 40,
      timerEnabled: true,
    });
  };

  return (
    <div className="space-y-8">
      {/* Action Strip */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button"
          onClick={handleStartPractice}
          disabled={loading}
          className="flex-1 group relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] border border-[var(--color-surface)] p-6 transition-all hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-answer-a)]/10 text-[var(--color-answer-a)]">
                <PlayIcon className="h-6 w-6" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-white">
                  {loading ? 'Starting...' : 'Start Practice'}
                </h3>
                <p className="text-sm text-[var(--color-muted)]">Randomized set of 40 mixed questions</p>
              </div>
            </div>
            <ArrowRightIcon className="h-5 w-5 text-[var(--color-muted)] group-hover:text-white transition-colors" />
          </div>
        </button>

        <Link
          href="/quiz/setup"
          className="flex-1 group relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] border border-[var(--color-surface)] p-6 transition-all hover:border-[var(--color-muted)]"
        >
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-answer-b)]/10 text-[var(--color-answer-b)]">
                <PlusIcon className="h-6 w-6" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-white">Create Quiz</h3>
                <p className="text-sm text-[var(--color-muted)]">Custom quiz by subject or tag</p>
              </div>
            </div>
            <ArrowRightIcon className="h-5 w-5 text-[var(--color-muted)] group-hover:text-white transition-colors" />
          </div>
        </Link>
      </div>
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-950/50 p-4 text-sm font-medium text-red-200">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-white mb-4">Question Bank Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mainCards.map((card) => {
            const Icon = card.icon;
            return (
              <div 
                key={card.title} 
                className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6 border border-transparent transition-colors hover:border-[var(--color-muted)]/30 cursor-pointer"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] ${card.bg} ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-white">{card.title}</h3>
                </div>
                <div className="mt-2">
                  <p className="text-3xl font-black text-white">{card.count}</p>
                  <p className="text-sm text-[var(--color-muted)] mt-1">{card.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
