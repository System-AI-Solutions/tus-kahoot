'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { createClient } from '@/lib/supabase/client';
import { QuizPlayer } from '@/components/quiz/QuizPlayer';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];

export default function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const store = useQuizStore();
  const hasHydrated = useQuizStore((state) => state.hasHydrated);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasHydrated) return;

    // Basic verification: user must have config and sessionId match
    if (!store.config || store.config.sessionId !== sessionId || store.questionJoinKeys.length === 0) {
      router.push('/dashboard');
      return;
    }

    async function fetchQuestions() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .in('join_key', store.questionJoinKeys);

      if (error || !data) {
        console.error(error);
        router.push('/dashboard');
        return;
      }

      // Preserve the sorted order from setup
      const ordered = store.questionJoinKeys
        .map((joinKey) => data.find((q) => q.join_key === joinKey))
        .filter((question): question is QuestionRow => Boolean(question));
      setQuestions(ordered);
      setLoading(false);
    }

    fetchQuestions();
  }, [hasHydrated, sessionId, store.config, store.questionJoinKeys, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-surface)] border-t-white" />
      </div>
    );
  }

  return <QuizPlayer questions={questions} />;
}
