'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuizStore } from '@/lib/stores/quiz-store';
import type { SubtopicTag } from '@/lib/constants';

type SectionFilter = 'all' | 'basic_sciences' | 'clinical_sciences';

interface StartQuizOptions {
  section: SectionFilter;
  selectedTopics?: string[];
  selectedSubtopics?: SubtopicTag[];
  questionCount: number;
  timerEnabled: boolean;
}

interface StartQuizResult {
  ok: boolean;
  error?: string;
}

export function useStartQuiz() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const startQuiz = useQuizStore((state) => state.startQuiz);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async ({
      section,
      selectedTopics = [],
      selectedSubtopics = [],
      questionCount,
      timerEnabled,
    }: StartQuizOptions): Promise<StartQuizResult> => {
      setLoading(true);
      setError(null);

      const fail = (message: string, log?: unknown): StartQuizResult => {
        if (log) console.error(log);
        setError(message);
        setLoading(false);
        return { ok: false, error: message };
      };

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setLoading(false);
        router.push('/login');
        return { ok: false, error: 'Not signed in.' };
      }

      let query = supabase.from('questions').select('question');
      if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
      if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);

      const { data: questions, error: questionsError } = await query;
      if (questionsError) {
        return fail('Could not load questions for this quiz. Please try again.', questionsError);
      }

      if (!questions || questions.length === 0) {
        return fail('No questions matched those filters.');
      }

      const shuffled = [...questions].sort(() => 0.5 - Math.random());
      const selectedQuestions =
        questionCount === -1 ? shuffled : shuffled.slice(0, questionCount);
      const questionIds = selectedQuestions.map((question) => question.question);

      if (questionIds.length === 0) {
        return fail('No questions matched those filters.');
      }

      const sectionFilter = section === 'all' ? null : section;
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: userData.user.id,
          timer_enabled: timerEnabled,
          section_filter: sectionFilter,
        })
        .select('id')
        .single();

      if (sessionError || !sessionData) {
        return fail('Could not create a quiz session. Please try again.', sessionError);
      }

      const sessionId = sessionData.id;
      startQuiz({ sessionId, timerEnabled, sectionFilter }, questionIds);
      router.push(`/quiz/${sessionId}`);

      return { ok: true };
    },
    [router, startQuiz, supabase]
  );

  return { start, loading, error, setError };
}
