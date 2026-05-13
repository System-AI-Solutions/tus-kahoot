import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { DashboardCards } from '@/components/DashboardCards';
import { RecentImports } from '@/components/RecentImports';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const BASIC_SCIENCE_KEYS = new Set([
  'anatomy',
  'anatomi',
  'bio',
  'biology',
  'basic',
  'basicscience',
  'basicsciences',
  'biyokimya',
  'biochemistry',
  'micro',
  'mikrobiyoloji',
  'microbiology',
  'path',
  'patoloji',
  'pathology',
  'pharm',
  'farmakoloji',
  'pharmacology',
]);

const CLINICAL_SCIENCE_KEYS = new Set([
  'internalmed',
  'clinical',
  'clinicalscience',
  'clinicalsciences',
  'dahiliye',
  'ichastaliklari',
  'internal_medicine',
  'internalmedicine',
  'cerrahi',
  'surgery',
  'peds',
  'pediatri',
  'pediatrics',
  'obgyn',
  'ob_gyn',
  'kadindogum',
  'obstetri',
  'jinekoloji',
  'obstetricsgynecology',
  'obstetrics_gynecology',
  'obstetricsandgynecology',
  'psychiatry',
  'neurology',
  'radiology',
  'orthopedics',
  'ophthalmology',
  'ent',
  'dermatology',
  'cardiology',
  'urology',
]);

type QuestionCategoryRow = {
  topic: string | null;
  subtopic: string | null;
  source_file: string | null;
  source_file_id: string | null;
};

function normalizeCategory(value: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

function matchesCategory(row: QuestionCategoryRow, categories: Set<string>) {
  return [row.subtopic, row.topic, row.source_file, row.source_file_id].some((value) => {
    const normalized = normalizeCategory(value);
    const underscored = value?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '';
    return categories.has(normalized) || categories.has(underscored) || [...categories].some((category) => {
      const normalizedCategory = normalizeCategory(category);
      return normalizedCategory.length > 0 && normalized.includes(normalizedCategory);
    });
  });
}

export default async function DashboardPage() {
  // Check auth - assuming we want to protect this page
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: questionCategories, count: allQuestions, error: questionCountError } = await supabase
    .from('questions')
    .select('topic, subtopic, source_file, source_file_id', { count: 'exact' });

  if (questionCountError) console.error('Could not load question category counts:', questionCountError);

  const categoryRows = (questionCategories || []) as QuestionCategoryRow[];
  const basicSciences = categoryRows.filter((row) => matchesCategory(row, BASIC_SCIENCE_KEYS)).length;
  const clinicalSciences = categoryRows.filter((row) => matchesCategory(row, CLINICAL_SCIENCE_KEYS)).length;

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)] overflow-hidden">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 overflow-y-auto bg-[var(--color-bg)] p-6 md:p-8 lg:p-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">Welcome back, Doctor</h1>
                <p className="text-[var(--color-muted)]">Ready to crush some medical MCQs today?</p>
              </div>
              <Link
                href="/dashboard"
                className="w-fit rounded-[var(--radius-button)] bg-white px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-white/85"
              >
                Dashboard
              </Link>
            </div>

            <DashboardCards
              counts={{
                basicSciences,
                clinicalSciences,
                allQuestions: allQuestions || categoryRows.length,
              }}
            />
            <RecentImports />
          </div>
        </main>
      </div>
    </div>
  );
}
