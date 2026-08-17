import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { UnflagButton } from '@/components/quiz/UnflagButton';
import { formatTopic } from '@/lib/utils';
import { formatExamProvenance } from '@/lib/exam-source';
import { formatFlagReason } from '@/lib/source-integrity';
import type { Database } from '@/lib/types/database';
import Link from 'next/link';
import { isAnswerLetter } from '@/lib/constants';

type QuestionRow = Database['public']['Tables']['questions']['Row'];
type FlaggedQuestion = Pick<
  QuestionRow,
  'join_key' | 'topic' | 'question_text' | 'correct_answer' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e' | 'question_number' | 'source_file'
>;
type FlagRow = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  questions: FlaggedQuestion | null;
};
type AnswerOptionKey = 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e';

function getCorrectAnswerText(question: FlaggedQuestion) {
  if (!isAnswerLetter(question.correct_answer)) return null;

  const answerKey = `option_${question.correct_answer.toLowerCase()}` as AnswerOptionKey;
  const answerText = question[answerKey];

  if (typeof answerText !== 'string' || answerText.trim().length === 0) return null;

  return `${question.correct_answer}: ${answerText}`;
}

export default async function FlaggedPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('question_flags')
    .select(`
      id,
      reason,
      note,
      created_at,
      questions (
        join_key,
        topic,
        question_text,
        correct_answer,
        option_a,
        option_b,
        option_c,
        option_d,
        option_e,
        question_number,
        source_file
      )
    `)
    .order('created_at', { ascending: false });
  const flags = data as unknown as FlagRow[] | null;

  return (
    <div className="min-h-screen pb-12">
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Flagged Questions</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              These questions stay out of every new quiz and out of the study-paper PDF until you
              remove the flag.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-[var(--radius-button)] bg-white px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-white/85"
          >
            Return
          </Link>
        </div>

        {flags && flags.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {flags.map((flag) => {
              const q = flag.questions;
              if (!q) return null;
              const correctAnswerText = getCorrectAnswerText(q);
              const examSource = formatExamProvenance(q.source_file, q.question_number);
              const flaggedOn = flag.created_at.slice(0, 10);

              return (
                <div
                  key={flag.id}
                  className="flex flex-col justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-lg"
                >
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="inline-block rounded-[var(--radius-chip)] bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200">
                        {formatFlagReason(flag.reason)}
                      </span>
                      <span className="inline-block rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-white">
                        {formatTopic(q.topic)}
                      </span>
                      {examSource && (
                        <span
                          title={
                            q.source_file
                              ? `Source file: ${q.source_file}`
                              : 'No source file recorded'
                          }
                          className="inline-block rounded-[var(--radius-chip)] bg-blue-600/20 px-3 py-1 text-xs font-bold text-blue-200"
                        >
                          {examSource}
                        </span>
                      )}
                    </div>
                    <p className="mb-4 line-clamp-3 text-sm font-medium text-white">
                      {q.question_text}
                    </p>
                    {flag.note && (
                      <p className="mb-4 whitespace-pre-line rounded bg-[var(--color-surface)] p-3 text-xs leading-relaxed text-[var(--color-body)]">
                        {flag.note}
                      </p>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded bg-[var(--color-surface)] p-3">
                      <div className="text-xs font-bold text-[var(--color-muted)]">
                        Recorded Answer
                      </div>
                      <div className="text-sm font-bold text-[var(--color-correct-banner)]">
                        {correctAnswerText ?? 'Unavailable'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[var(--color-muted)]">Flagged {flaggedOn}</span>
                      <UnflagButton flagId={flag.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-12 text-center">
            <h3 className="text-lg font-bold text-white">No flagged questions</h3>
            <p className="mt-2 text-[var(--color-muted)]">
              Use the flag icon on a question to report a source mismatch, a wrong answer or a
              broken question. Flagged questions land here.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
