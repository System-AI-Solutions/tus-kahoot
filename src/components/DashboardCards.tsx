import { 
  BeakerIcon, 
  AcademicCapIcon, 
  DocumentTextIcon, 
  ArrowRightIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export type DashboardCardCounts = {
  basicSciences: number;
  clinicalSciences: number;
  allQuestions: number;
};

const numberFormatter = new Intl.NumberFormat('en-US');

export function DashboardCards({ counts }: { counts: DashboardCardCounts }) {
  const mainCards = [
    {
      title: 'Basic Sciences',
      count: numberFormatter.format(counts.basicSciences),
      description: 'Anatomy, Bio, Micro, Path, Pharm',
      icon: BeakerIcon,
      color: 'text-[var(--color-answer-b)]',
      bg: 'bg-[var(--color-answer-b)]/10',
    },
    {
      title: 'Clinical Sciences',
      count: numberFormatter.format(counts.clinicalSciences),
      description: 'Internal Med, Surgery, Peds, OBGYN',
      icon: AcademicCapIcon,
      color: 'text-[var(--color-correct-banner)]',
      bg: 'bg-[var(--color-correct-banner)]/10',
    },
    {
      title: 'All Questions',
      count: numberFormatter.format(counts.allQuestions),
      description: 'Total questions in your bank',
      icon: DocumentTextIcon,
      color: 'text-[var(--color-answer-e)]',
      bg: 'bg-[var(--color-answer-e)]/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Action Strip */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/quiz/setup" className="flex-1 group relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] border border-[var(--color-surface)] p-6 transition-all hover:border-[var(--color-muted)]">
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

      <div>
        <h2 className="text-xl font-bold text-white mb-4">Question Bank Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mainCards.map((card) => {
            const Icon = card.icon;
            return (
              <div 
                key={card.title} 
                className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6 border border-transparent"
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
