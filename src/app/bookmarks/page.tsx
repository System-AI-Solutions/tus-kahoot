import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { formatTopic } from '@/lib/utils';
import type { Database } from '@/lib/types/database';
import Link from 'next/link';

type QuestionRow = Database['public']['Tables']['questions']['Row'];
type BookmarkQuestion = Pick<
  QuestionRow,
  'join_key' | 'topic' | 'question_text' | 'correct_answer' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e'
>;
type BookmarkRow = {
  id: string;
  questions: BookmarkQuestion | null;
};
type AnswerOptionKey = 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e';

export default async function BookmarksPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('bookmarks')
    .select(`
      id,
      questions (
        join_key,
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
  const bookmarks = data as unknown as BookmarkRow[] | null;

  return (
    <div className="min-h-screen pb-12">
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Your Bookmarks</h1>
          <Link
            href="/dashboard"
            className="rounded-[var(--radius-button)] bg-white px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-white/85"
          >
            Return
          </Link>
        </div>

        {bookmarks && bookmarks.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((b) => {
              const q = b.questions;
              if (!q) return null;
              const answerKey = `option_${q.correct_answer.toLowerCase()}` as AnswerOptionKey;
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
                      {q.correct_answer}: {q[answerKey]}
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
