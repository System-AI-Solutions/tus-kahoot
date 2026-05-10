import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { formatTopic } from '@/lib/utils';
import Link from 'next/link';

export default async function BookmarksPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // @ts-ignore
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select(`
      id,
      questions (
        question,
        topic,
        question_text,
        correct_answer,
        option_a,
        option_b,
        option_c,
        option_d,
        option_e
      )
    `)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen pb-12">
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Your Bookmarks</h1>
        </div>

        {bookmarks && bookmarks.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((b: any) => {
              const q = b.questions;
              const ansKey = `option_${q.correct_answer.toLowerCase()}`;
              return (
                <div key={b.id} className="flex flex-col justify-between rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-lg">
                  <div>
                    <span className="mb-3 inline-block rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-white">
                      {formatTopic(q.topic)}
                    </span>
                    <p className="line-clamp-3 text-sm font-medium text-white mb-4">
                      {q.question_text}
                    </p>
                  </div>
                  <div className="rounded bg-[var(--color-surface)] p-3">
                    <div className="text-xs font-bold text-[var(--color-muted)]">Correct Answer</div>
                    <div className="text-sm font-bold text-[var(--color-correct-banner)]">
                      {q.correct_answer}: {q[ansKey]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-12 text-center">
            <h3 className="text-lg font-bold text-white">No bookmarks yet</h3>
            <p className="mt-2 text-[var(--color-muted)]">Questions you bookmark during quizzes will appear here.</p>
            <Link href="/dashboard" className="mt-6 inline-block rounded bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700">
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
