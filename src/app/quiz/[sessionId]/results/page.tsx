'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { readPersistedQuizState, useQuizStore } from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/Header';
import { AccuracyRing } from '@/components/ui/AccuracyRing';
import { openQuizPdf, type PdfQuestion } from '@/lib/quiz/exam-pdf';
import { formatExamSource } from '@/lib/utils';
import Link from 'next/link';

type SaveState = 'saving' | 'saved' | 'error';

export default function ResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const config = useQuizStore((state) => state.config);
  const answers = useQuizStore((state) => state.answers);
  const score = useQuizStore((state) => state.score);
  const maxStreak = useQuizStore((state) => state.maxStreak);
  const saveInFlight = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>('saving');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
          setRestoreError('Could not restore quiz results. Please start a new quiz.');
        }
      });
      return () => {
        cancelled = true;
      };
    }

    async function saveResults() {
      if (saveInFlight.current) return;
      saveInFlight.current = true;
      setSaveState('saving');
      setSaveError(null);

      const finishWithError = (message: string, log?: unknown) => {
        if (log) console.error(log);
        saveInFlight.current = false;
        if (!cancelled) {
          setSaveError(message);
          setSaveState('error');
        }
      };

      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        finishWithError(userError?.message || 'You must be logged in to save results.');
        return;
      }

      const answerJoinKeys = Array.from(new Set(answers.map((answer) => answer.joinKey)));
      if (answerJoinKeys.some((joinKey) => typeof joinKey !== 'string' || joinKey.length === 0)) {
        finishWithError('Could not save attempts: missing question identifier.', {
          sessionId,
          answers,
        });
        return;
      }

      const { data: questionNumberRows, error: questionNumbersError } = await supabase
        .from('questions')
        .select('join_key, question_number')
        .in('join_key', answerJoinKeys);

      if (questionNumbersError || !questionNumberRows) {
        finishWithError(
          `Could not resolve question numbers: ${
            questionNumbersError?.message || 'No question data returned'
          }`,
          questionNumbersError
        );
        return;
      }

      const questionNumberByJoinKey = new Map(
        questionNumberRows.map((question) => [question.join_key, question.question_number])
      );
      const unresolvedJoinKeys = answerJoinKeys.filter(
        (joinKey) => typeof questionNumberByJoinKey.get(joinKey) !== 'number'
      );

      if (unresolvedJoinKeys.length > 0) {
        finishWithError(
          'Could not save attempts: missing question number for one or more questions.',
          { sessionId, unresolvedJoinKeys }
        );
        return;
      }

      const attemptsToUpsert = answers.map((answer) => ({
        user_id: user.id,
        session_id: sessionId,
        join_key: answer.joinKey,
        question_number: questionNumberByJoinKey.get(answer.joinKey) as number,
        user_answer: answer.userAnswer,
        is_correct: answer.isCorrect,
        time_taken_ms: answer.timeTakenMs,
      }));

      // Upsert so re-saving the same session (retry, page refresh) is a no-op
      // instead of a duplicate-key error.
      const { error: attemptsError } = await supabase
        .from('attempts')
        .upsert(attemptsToUpsert, { onConflict: 'session_id,join_key', ignoreDuplicates: true });
      if (attemptsError) {
        const needsMigration =
          attemptsError.message.includes('ON CONFLICT') ||
          attemptsError.message.includes('attempts_join_key_key');
        finishWithError(
          needsMigration
            ? `Could not save attempts: ${attemptsError.message}. The database migration "20260703000000_allow_repeat_attempts.sql" has not been applied yet.`
            : `Could not save attempts: ${attemptsError.message}`,
          attemptsError
        );
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
        finishWithError(`Could not update session: ${sessionError.message}`, sessionError);
        return;
      }

      if (!cancelled) {
        setSaveState('saved');
      }
    }

    saveResults();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hydrationTimedOut, sessionId, config, answers, score, maxStreak, saveAttempt]);

  const handleRetrySave = useCallback(() => {
    setSaveAttempt((attempt) => attempt + 1);
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true);
    setPdfError(null);

    try {
      const joinKeys = answers.map((answer) => answer.joinKey);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('questions')
        .select(
          'join_key, question_number, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, source_file, topic'
        )
        .in('join_key', joinKeys);

      if (error || !data) {
        throw new Error(error?.message || 'Could not load questions for the PDF.');
      }

      const questionByJoinKey = new Map(data.map((question) => [question.join_key, question]));
      const orderedQuestions: PdfQuestion[] = joinKeys
        .map((joinKey) => questionByJoinKey.get(joinKey))
        .filter((question): question is NonNullable<typeof question> => Boolean(question));

      if (orderedQuestions.length === 0) {
        throw new Error('No question data available for this quiz.');
      }

      const answersByJoinKey = new Map(answers.map((answer) => [answer.joinKey, answer]));
      const opened = openQuizPdf({
        title: `MedBank Quiz — ${new Date().toLocaleDateString('en-GB')}`,
        questions: orderedQuestions,
        answersByJoinKey,
      });

      if (!opened) {
        throw new Error('The print window was blocked. Please allow pop-ups for this site.');
      }
    } catch (error) {
      console.error(error);
      setPdfError(error instanceof Error ? error.message : 'Could not generate the PDF.');
    } finally {
      setPdfLoading(false);
    }
  }, [answers]);

  if (restoreError) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <Header />
        <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-8">
            <h1 className="text-2xl font-bold text-white">Results Could Not Load</h1>
            <p className="mt-3 text-sm text-red-100">{restoreError}</p>
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

  if (!config && !hydrationTimedOut) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-xl font-bold text-white animate-pulse">Loading results...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-12">
      <Header />
      <main className="mx-auto mt-8 max-w-4xl px-4">
        {saveState === 'saving' && (
          <div className="mb-4 rounded-[var(--radius-card)] border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-blue-100">
            Saving results...
          </div>
        )}
        {saveState === 'error' && (
          <div className="mb-4 rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-sm text-red-100">
              <span className="font-bold">Your results could not be saved:</span> {saveError}
            </p>
            <p className="mt-1 text-xs text-red-200/80">
              Your score below is still correct, but this quiz won&apos;t appear in your stats or
              review page until saving succeeds. You can still download the PDF.
            </p>
            <button
              onClick={handleRetrySave}
              className="mt-3 rounded-[var(--radius-button)] bg-white px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-neutral-200"
            >
              Retry Save
            </button>
          </div>
        )}

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

          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="rounded-[var(--radius-button)] bg-white px-6 py-3 font-bold text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
            >
              {pdfLoading ? 'Preparing PDF...' : 'Download PDF'}
            </button>
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
          {pdfError && <p className="mt-4 text-sm text-red-300">{pdfError}</p>}
        </div>

        <div className="mt-8 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-bold text-white">Summary Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--color-muted)]">
              <thead className="bg-[#111] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Your Answer</th>
                  <th className="px-4 py-3">Correct</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((answer, index) => (
                  <tr key={index} className="border-b border-[#222]">
                    <td className="px-4 py-3 text-white">Q{index + 1}</td>
                    <td className="px-4 py-3">
                      {formatExamSource(answer.sourceFile, answer.questionNumber) || '—'}
                    </td>
                    <td className="px-4 py-3">{answer.userAnswer ?? '—'}</td>
                    <td className="px-4 py-3">{answer.correctAnswer ?? '—'}</td>
                    <td className="px-4 py-3">
                      {answer.isCorrect ? (
                        <span className="font-bold text-[var(--color-correct-banner)]">
                          ✓ Correct
                        </span>
                      ) : (
                        <span className="font-bold text-[var(--color-wrong-banner)]">
                          ✗ Wrong
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
