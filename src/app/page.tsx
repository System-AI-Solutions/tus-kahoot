import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { DashboardCards } from '@/components/DashboardCards';
import { RecentImports } from '@/components/RecentImports';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const BASIC_SCIENCE_SUBTOPICS = [
  'anatomy',
  'biochemistry',
  'microbiology',
  'pathology',
  'pharmacology',
] as const;

const CLINICAL_SCIENCE_SUBTOPICS = [
  'internal_medicine',
  'surgery',
  'pediatrics',
  'obstetrics_gynecology',
  'psychiatry',
  'neurology',
  'radiology',
  'orthopedics',
  'ophthalmology',
  'ent',
  'dermatology',
  'cardiology',
  'urology',
] as const;

export default async function DashboardPage() {
  // Check auth - assuming we want to protect this page
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [
    { count: allQuestions },
    { count: basicSciences },
    { count: clinicalSciences },
  ] = await Promise.all([
    supabase.from('questions').select('question', { count: 'exact', head: true }),
    supabase
      .from('questions')
      .select('question', { count: 'exact', head: true })
      .in('subtopic', BASIC_SCIENCE_SUBTOPICS),
    supabase
      .from('questions')
      .select('question', { count: 'exact', head: true })
      .in('subtopic', CLINICAL_SCIENCE_SUBTOPICS),
  ]);

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
                basicSciences: basicSciences || 0,
                clinicalSciences: clinicalSciences || 0,
                allQuestions: allQuestions || 0,
              }}
            />
            <RecentImports />
          </div>
        </main>
      </div>
    </div>
  );
}
