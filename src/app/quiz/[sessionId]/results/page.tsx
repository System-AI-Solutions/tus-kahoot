'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/Header';
import { AccuracyRing } from '@/components/ui/AccuracyRing';
import Link from 'next/link';

export default function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const config = useQuizStore((state) => state.config);
  const answers = useQuizStore((state) => state.answers);
  const score = useQuizStore((state) => state.score);
  const maxStreak = useQuizStore((state) => state.maxStreak);
  const hasSaved = useRef(false);
  const [loading, setLoading] = useState(true);

  const totalQuestions = answers.length;
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  useEffect(() => {
    if (!hasHydrated) return;

    // Basic verification
    if (!config || config.sessionId !== sessionId || answers.length === 0) {
      router.push('/dashboard');
      return;
    }

    async function saveResults() {
      if (hasSaved.current) return;
      hasSaved.current = true;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Save all attempts
      const attemptsToInsert = answers.map((a) => ({
        user_id: user.id,
        session_id: sessionId,
        question_id: a.questionId,
        user_answer: a.userAnswer,
        is_correct: a.isCorrect,
        time_taken_ms: a.timeTakenMs,
      }));

      await supabase.from('attempts').insert(attemptsToInsert);

      // 2. Update session score & streak
      await supabase
        .from('sessions')
        .update({
          score,
          max_streak: maxStreak,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      setLoading(false);
    }

    saveResults();
  }, [hasHydrated, sessionId, config, answers, score, maxStreak, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-xl font-bold text-white animate-pulse">Saving results...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12">
      <Header />
      <main className="mx-auto mt-8 max-w-4xl px-4">
        <div className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-8 text-center shadow-xl">
          <h1 className="text-3xl font-bold text-white">Quiz Completed!</h1>
          
          <div className="mt-8 flex flex-col items-center justify-center gap-8 md:flex-row md:gap-16">
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium text-[var(--color-muted)]">Final Score</span>
              <span className="mt-2 text-5xl font-black text-white">{score}</span>
            </div>
            
            <div className="flex flex-col items-center">
              <span className="mb-2 text-sm font-medium text-[var(--color-muted)]">Accuracy</span>
              <AccuracyRing percentage={accuracy} size={100} strokeWidth={8} />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-sm font-medium text-[var(--color-muted)]">Max Streak</span>
              <span className="mt-2 text-4xl font-bold text-orange-500">🔥 {maxStreak}</span>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/review"
              className="rounded-[var(--radius-button)] bg-[var(--color-surface)] px-6 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
            >
              Review Wrong Answers
            </Link>
            <Link
              href="/quiz/setup"
              className="rounded-[var(--radius-button)] bg-[var(--color-surface)] px-6 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
            >
              Play Again
            </Link>
            <Link
              href="/dashboard"
              className="rounded-[var(--radius-button)] bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-bold text-white">Summary Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--color-muted)]">
              <thead className="bg-[#111] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((a, i) => (
                  <tr key={i} className="border-b border-[#222]">
                    <td className="px-4 py-3 text-white">Q{i + 1}</td>
                    <td className="px-4 py-3">
                      {a.isCorrect ? (
                        <span className="font-bold text-[var(--color-correct-banner)]">✓ Correct</span>
                      ) : (
                        <span className="font-bold text-[var(--color-wrong-banner)]">✗ Wrong</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{(a.timeTakenMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
