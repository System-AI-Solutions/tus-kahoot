'use client';

import { useCallback, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { ANSWER_LETTERS, type SubtopicTag } from '@/lib/constants';
import { fetchQuestionExclusions, isExcludedQuestion } from '@/lib/source-integrity';

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
  const supabase = useMemo(() => createClient(), []);
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
        window.location.assign('/login');
        return { ok: false, error: 'Not signed in.' };
      }

      let query = supabase
        .from('questions')
        .select('join_key, source_file')
        .not('join_key', 'is', null)
        .in('correct_answer', [...ANSWER_LETTERS]);
      if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
      if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);

      const { data: questions, error: questionsError } = await query;
      if (questionsError) {
        return fail('Could not load questions for this quiz. Please try again.', questionsError);
      }

      if (!questions || questions.length === 0) {
        return fail('No questions matched those filters.');
      }

      // Questions the user flagged and exam papers they quarantined never enter
      // a quiz pool.
      const exclusions = await fetchQuestionExclusions(supabase);
      const usableJoinKeys = questions
        .filter(
          (question) =>
            typeof question.join_key === 'string' &&
            question.join_key.length > 0 &&
            !isExcludedQuestion(exclusions, {
              joinKey: question.join_key,
              sourceFile: question.source_file,
            })
        )
        .map((question) => question.join_key)
        .filter((joinKey): joinKey is string => typeof joinKey === 'string');

      if (usableJoinKeys.length === 0) {
        return fail(
          'Every question matching those filters is flagged or comes from an excluded exam source.'
        );
      }

      const shuffled = [...usableJoinKeys].sort(() => 0.5 - Math.random());
      const questionJoinKeys =
        questionCount === -1 ? shuffled : shuffled.slice(0, questionCount);

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
      useQuizStore.getState().startQuiz({ sessionId, timerEnabled, sectionFilter }, questionJoinKeys);
      window.location.assign(`/quiz/${sessionId}`);

      return { ok: true };
    },
    [supabase]
  );

  return { start, loading, error, setError };
}
