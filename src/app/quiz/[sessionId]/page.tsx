'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { readPersistedQuizState, useQuizStore } from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/Header';
import { QuizPlayer } from '@/components/quiz/QuizPlayer';
import { isAnswerLetter } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];

function hasSelectedAnswerOption(question: QuestionRow) {
  if (!isAnswerLetter(question.correct_answer)) return false;

  let answerText: string | null;

  switch (question.correct_answer) {
    case 'A':
      answerText = question.option_a;
      break;
    case 'B':
      answerText = question.option_b;
      break;
    case 'C':
      answerText = question.option_c;
      break;
    case 'D':
      answerText = question.option_d;
      break;
    case 'E':
      answerText = question.option_e;
      break;
  }

  return typeof answerText === 'string' && answerText.trim().length > 0;
}

export default function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const store = useQuizStore();
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const config = useQuizStore((state) => state.config);
  const questionJoinKeys = useQuizStore((state) => state.questionJoinKeys);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

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
    const activeConfig = config ?? persistedState?.config ?? null;
    const activeQuestionJoinKeys =
      questionJoinKeys.length > 0
        ? questionJoinKeys
        : persistedState?.questionJoinKeys ?? [];

    if (
      !activeConfig ||
      activeConfig.sessionId !== sessionId ||
      activeQuestionJoinKeys.length === 0
    ) {
      queueMicrotask(() => {
        if (!cancelled) {
          setLoadError('Could not restore this quiz. Please start a new quiz.');
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (!hasHydrated && persistedState) {
      useQuizStore.setState({ ...persistedState, hasHydrated: true });
    }

    async function fetchQuestions() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .in('join_key', activeQuestionJoinKeys);

      if (error || !data) {
        console.error(error);
        if (!cancelled) {
          setLoadError('Could not load questions for this quiz. Please try starting again.');
          setLoading(false);
        }
        return;
      }

      // Preserve the sorted order from setup
      const ordered = activeQuestionJoinKeys
        .map((joinKey) => data.find((q) => q.join_key === joinKey))
        .filter((question): question is QuestionRow => Boolean(question))
        .filter(hasSelectedAnswerOption);

      if (ordered.length === 0) {
        console.error('Quiz contains no playable questions after answer validation.', {
          sessionId,
          requestedJoinKeys: store.questionJoinKeys,
        });
        router.push('/dashboard');
        return;
      }

      if (ordered.length !== store.questionJoinKeys.length) {
        console.error('Quiz contained invalid questions that were removed before play.', {
          sessionId,
          requestedCount: store.questionJoinKeys.length,
          playableCount: ordered.length,
        });
      }

      setQuestions(ordered);
      setLoading(false);
    }

    fetchQuestions();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hydrationTimedOut, sessionId, config, questionJoinKeys]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-surface)] border-t-white" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <Header />
        <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-8">
            <h1 className="text-2xl font-bold text-white">Quiz Could Not Load</h1>
            <p className="mt-3 text-sm text-red-100">{loadError}</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/quiz/setup"
                className="rounded-[var(--radius-button)] bg-white px-5 py-3 font-bold text-black transition-colors hover:bg-neutral-200"
              >
                Back to Quiz Setup
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

  return <QuizPlayer questions={questions} />;
}
