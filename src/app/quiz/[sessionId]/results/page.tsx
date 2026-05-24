'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  readPersistedQuizState,
  useQuizStore,
  type AnswerRecord,
} from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/Header';
import { AccuracyRing } from '@/components/ui/AccuracyRing';
import Link from 'next/link';

type PersistableAnswerRecord = AnswerRecord & { questionNumber: number };

function hasPersistableQuestionNumber(answer: AnswerRecord): answer is PersistableAnswerRecord {
  return typeof answer.questionNumber === 'number' && Number.isInteger(answer.questionNumber);
}

export default function ResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const config = useQuizStore((state) => state.config);
  const answers = useQuizStore((state) => state.answers);
  const score = useQuizStore((state) => state.score);
  const maxStreak = useQuizStore((state) => state.maxStreak);
  const hasSaved = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  const totalQuestions = answers.length;
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  useEffect(() => {
    if (hasHydrated) return;

    const timerId = window.setTimeout(() => {
      setHydrationTimedOut(true);
    }, 1200);

    return () => window.clearTimeout(timerId);
  }, [hasHydrated]);

  useEffect(() => {
    let cancelled = false;

    if (!hasHydrated && !hydrationTimedOut) return;

    const persistedState = hasHydrated ? null : readPersistedQuizState();

    if (!hasHydrated && persistedState?.config) {
      useQuizStore.setState({ ...persistedState, hasHydrated: true });
      return;
    }

    if (!config || config.sessionId !== sessionId || answers.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setSaveError('Could not restore quiz results. Please start a new quiz.');
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    async function saveResults() {
      if (hasSaved.current) return;
      hasSaved.current = true;
      setSaveError(null);

      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cancelled) {
          setSaveError(userError?.message || 'You must be logged in to save results.');
          setLoading(false);
        }
        return;
      }

      if (!answers.every(hasPersistableQuestionNumber)) {
        console.error('Could not save attempts: missing question number.', { sessionId, answers });
        if (!cancelled) {
          setSaveError('Could not save attempts: missing question number.');
          setLoading(false);
        }
        return;
      }

      const attemptsToInsert = answers.map((answer) => ({
        user_id: user.id,
        session_id: sessionId,
        join_key: answer.joinKey,
        question_number: answer.questionNumber,
        user_answer: answer.userAnswer,
        is_correct: answer.isCorrect,
        time_taken_ms: answer.timeTakenMs,
      }));

      const { error: attemptsError } = await supabase.from('attempts').insert(attemptsToInsert);
      if (attemptsError) {
        console.error(attemptsError);
        if (!cancelled) {
          setSaveError(`Could not save attempts: ${attemptsError.message}`);
          setLoading(false);
        }
        return;
      }

      const { error: sessionError } = await supabase
        .from('sessions')
        .update({
          score,
          max_streak: maxStreak,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (sessionError) {
        console.error(sessionError);
        if (!cancelled) {
          setSaveError(`Could not update session: ${sessionError.message}`);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    saveResults();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hydrationTimedOut, sessionId, config, answers, score, maxStreak]);

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

  if (saveError) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <Header />
        <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-8">
            <h1 className="text-2xl font-bold text-white">Results Could Not Load</h1>
            <p className="mt-3 text-sm text-red-100">{saveError}</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/quiz/setup"
                className="rounded-[var(--radius-button)] bg-white px-5 py-3 font-bold text-black transition-colors hover:bg-neutral-200"
              >
                Start New Quiz
              </Link>
              <Link
                href="/dashboard"
                className="rounded-[var(--radius-button)] bg-[var(--color-surface)] px-5 py-3 font-bold text-white transition-colors hover:bg-neutral-800"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </main>
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
              <span className="mt-2 text-4xl font-bold text-orange-500">ðŸ”¥ {maxStreak}</span>
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
                {answers.map((answer, index) => (
                  <tr key={index} className="border-b border-[#222]">
                    <td className="px-4 py-3 text-white">Q{index + 1}</td>
                    <td className="px-4 py-3">
                      {answer.isCorrect ? (
                        <span className="font-bold text-[var(--color-correct-banner)]">
                          âœ“ Correct
                        </span>
                      ) : (
                        <span className="font-bold text-[var(--color-wrong-banner)]">
                          âœ— Wrong
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{(answer.timeTakenMs / 1000).toFixed(1)}s</td>
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
