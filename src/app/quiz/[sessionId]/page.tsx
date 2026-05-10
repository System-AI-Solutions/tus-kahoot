'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { QuizPlayer } from '@/components/quiz/QuizPlayer';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];
type QuizQuestion = Pick<
  QuestionRow,
  | 'question'
  | 'question_text'
  | 'option_a'
  | 'option_b'
  | 'option_c'
  | 'option_d'
  | 'option_e'
  | 'correct_answer'
>;

export default function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const config = useQuizStore((state) => state.config);
  const questionIds = useQuizStore((state) => state.questionIds);
  const [questions, setQuestions] = useState<
    {
      id: number;
      stem: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      option_e: string | null;
      correct_answer: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasHydrated) return;

    // Basic verification: user must have config and sessionId match
    if (!config || config.sessionId !== sessionId || questionIds.length === 0) {
      router.push('/dashboard');
      return;
    }

    async function fetchQuestions() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('questions')
        .select('question, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer')
        .in('question', questionIds);

      if (error || !data) {
        console.error(error);
        router.push('/dashboard');
        return;
      }

      // Preserve the sorted order from setup
      const ordered = questionIds
        .map((id) => data.find((q) => q.question === id))
        .filter((question): question is QuizQuestion => Boolean(question))
        .map((question) => ({
          id: question.question,
          stem: question.question_text,
          option_a: question.option_a,
          option_b: question.option_b,
          option_c: question.option_c,
          option_d: question.option_d,
          option_e: question.option_e,
          correct_answer: question.correct_answer,
        }));
      setQuestions(ordered);
      setLoading(false);
    }

    fetchQuestions();
  }, [hasHydrated, sessionId, config, questionIds, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-surface)] border-t-white" />
      </div>
    );
  }

  return <QuizPlayer questions={questions} />;
}
