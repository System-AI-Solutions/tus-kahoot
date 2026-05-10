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
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Basic verification: user must have config and sessionId match
    if (!store.config || store.config.sessionId !== sessionId || store.questionIds.length === 0) {
      router.push('/dashboard');
      return;
    }

    async function fetchQuestions() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .in('id', store.questionIds);

      if (error || !data) {
        console.error(error);
        router.push('/dashboard');
        return;
      }

      // Preserve the sorted order from setup
      const ordered = store.questionIds
        .map((id) => data.find((q) => q.id === id))
        .filter((question): question is QuestionRow => Boolean(question));
      setQuestions(ordered);
      setLoading(false);
    }

    fetchQuestions();
  }, [sessionId, store.config, store.questionIds, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-surface)] border-t-white" />
      </div>
    );
  }

  return <QuizPlayer questions={questions} />;
}
