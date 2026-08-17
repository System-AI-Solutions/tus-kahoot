import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { ExplanationPanel } from '@/components/quiz/ExplanationPanel';
import { HighlightedText } from '@/components/quiz/HighlightedText';
import { QuestionFlagButton } from '@/components/quiz/QuestionFlagButton';
import { formatTopic, cn } from '@/lib/utils';
import { formatExamProvenance } from '@/lib/exam-source';
import Link from 'next/link';
import { ANSWER_COLORS, isAnswerLetter, type AnswerLetter } from '@/lib/constants';
import { fetchExplanationsByJoinKey, getStemHighlights } from '@/lib/explanations';
import { fetchFlagsByJoinKey } from '@/lib/source-integrity';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];
type ReviewQuestion = Pick<
  QuestionRow,
  'join_key' | 'topic' | 'question_text' | 'correct_answer' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e' | 'question_number' | 'source_file'
>;
type ReviewAttempt = {
  id: string;
  user_answer: string | null;
  questions: ReviewQuestion | null;
};
type AnswerOption = {
  letter: AnswerLetter;
  text: string;
};

function toAnswerOption(letter: AnswerLetter, text: string | null): AnswerOption | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  return { letter, text };
}

export default async function ReviewPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('attempts')
    .select(`
      id,
      user_answer,
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
    .eq('is_correct', false)
    .order('created_at', { ascending: false });
  const attempts = data as unknown as ReviewAttempt[] | null;

  // Group by topic
  const grouped: Record<string, ReviewAttempt[]> = {};
  if (attempts) {
    attempts.forEach((a) => {
      const q = a.questions;
      if (!q) return;
      const topic = q.topic || 'untagged';
      if (!grouped[topic]) grouped[topic] = [];
      // Prevent duplicates if answered wrong multiple times
      if (!grouped[topic].find((ext) => ext.questions?.join_key === q.join_key)) {
        grouped[topic].push(a);
      }
    });
  }

  const topics = Object.keys(grouped).sort();

  const reviewJoinKeys = topics.flatMap((topic) =>
    grouped[topic]
      .map((attempt) => attempt.questions?.join_key)
      .filter((joinKey): joinKey is string => typeof joinKey === 'string')
  );

  const [explanations, flags] = await Promise.all([
    fetchExplanationsByJoinKey(supabase, reviewJoinKeys),
    fetchFlagsByJoinKey(supabase, reviewJoinKeys),
  ]);

  return (
    <div className="min-h-screen pb-12">
      <Header />
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-3xl font-bold text-white">Review Wrong Answers</h1>
        
        {topics.length > 0 ? (
          <div className="space-y-12">
            {topics.map((topic) => (
              <section key={topic}>
                <h2 className="mb-4 text-xl font-bold text-white border-b border-[var(--color-surface)] pb-2 flex items-center justify-between">
                  {formatTopic(topic)}
                  <span className="text-sm font-medium text-[var(--color-muted)] bg-[var(--color-surface)] px-3 py-1 rounded-full">
                    {grouped[topic].length} questions
                  </span>
                </h2>
                
                <div className="space-y-6">
                  {grouped[topic].map((a) => {
                    const q = a.questions;
                    if (!q) return null;
                    const correctAnswer = isAnswerLetter(q.correct_answer)
                      ? q.correct_answer
                      : null;
                    const options = [
                      toAnswerOption('A', q.option_a),
                      toAnswerOption('B', q.option_b),
                      toAnswerOption('C', q.option_c),
                      toAnswerOption('D', q.option_d),
                      toAnswerOption('E', q.option_e),
                    ].filter((option): option is AnswerOption => Boolean(option));

                    const examSource = formatExamProvenance(q.source_file, q.question_number);

                    return (
                      <div key={a.id} className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-md">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          {examSource ? (
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
                          ) : (
                            <span />
                          )}
                          <QuestionFlagButton
                            joinKey={q.join_key}
                            initialFlag={flags.get(q.join_key) ?? null}
                          />
                        </div>
                        <p className="mb-6 font-medium text-white">
                          {q.question_text ? (
                            <HighlightedText
                              text={q.question_text}
                              phrases={getStemHighlights(explanations.get(q.join_key))}
                            />
                          ) : (
                            'Question text unavailable'
                          )}
                        </p>
                        
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {options.map((opt) => {
                            const isCorrect = opt.letter === correctAnswer;
                            const isUserWrong = opt.letter === a.user_answer;
                            
                            let borderClass = 'border-[var(--color-surface)] text-[var(--color-muted)]';
                            let icon = '';
                            
                            if (isCorrect) {
                              borderClass = 'border-[var(--color-correct-banner)] text-white bg-[var(--color-correct-banner)]/10';
                              icon = '✓';
                            } else if (isUserWrong) {
                              borderClass = 'border-[var(--color-wrong-banner)] text-white bg-[var(--color-wrong-banner)]/10';
                              icon = '✗';
                            }

                            return (
                              <div key={opt.letter} className={cn("flex items-center gap-3 rounded border p-3", borderClass)}>
                                <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white", ANSWER_COLORS[opt.letter])}>
                                  {opt.letter}
                                </div>
                                <span className={isCorrect || isUserWrong ? 'font-semibold' : ''}>{opt.text}</span>
                                <span className="ml-auto font-bold">{icon}</span>
                              </div>
                            );
                          })}
                        </div>

                        <ExplanationPanel
                          className="mt-6"
                          joinKey={q.join_key}
                          explanation={explanations.get(q.join_key) ?? null}
                          options={options}
                          correctLetter={correctAnswer}
                          selectedLetter={a.user_answer}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-12 text-center">
            <h3 className="text-lg font-bold text-white">No wrong answers found</h3>
            <p className="mt-2 text-[var(--color-muted)]">Great job! You haven&apos;t made any mistakes yet.</p>
            <Link href="/dashboard" className="mt-6 inline-block rounded bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700">
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
