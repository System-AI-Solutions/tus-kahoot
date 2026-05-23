'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { PillToggle } from '@/components/ui/PillToggle';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Header } from '@/components/Header';
import { isSubtopicTag, type SubtopicTag } from '@/lib/constants';
import { formatTopic } from '@/lib/utils';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function formatSupabaseError(error: SupabaseErrorLike) {
  return error.message || error.details || error.hint || error.code || 'Unknown Supabase error';
}

export default function QuizSetupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const setConfig = useQuizStore((state) => state.setConfig);
  const setQuestionJoinKeys = useQuizStore((state) => state.setQuestionJoinKeys);

  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [availableSubtopics, setAvailableSubtopics] = useState<SubtopicTag[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<SubtopicTag[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(true);
  const [excludeIncomplete, setExcludeIncomplete] = useState<boolean>(true);
  
  const [matchingCount, setMatchingCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch topics dynamically
  useEffect(() => {
    async function fetchTopics() {
      const { data, error } = await supabase.from('questions').select('topic');
      if (error) {
        setErrorMessage(`Could not load topics: ${error.message}`);
        return;
      }
      if (data) {
        const unique = Array.from(
          new Set(
            data
              .map((d: Pick<QuestionRow, 'topic'>) => d.topic)
              .filter((topic): topic is string => typeof topic === 'string' && topic.length > 0)
          )
        ).sort();
        setAvailableTopics(unique);
      }
    }
    fetchTopics();
  }, [supabase]);

  // Fetch subtopics dynamically based on topics
  useEffect(() => {
    async function fetchSubtopics() {
      if (selectedTopics.length === 0) {
        setAvailableSubtopics([]);
        setSelectedSubtopics([]);
        return;
      }
      const { data } = await supabase
        .from('questions')
        .select('subtopic')
        .in('topic', selectedTopics)
        .not('subtopic', 'is', null);

      if (data) {
        const unique = Array.from(
          new Set(
            data
              .map((d: Pick<QuestionRow, 'subtopic'>) => d.subtopic)
              .filter(isSubtopicTag)
          )
        ).sort();
        setAvailableSubtopics(unique);
        setSelectedSubtopics([]);
      }
    }
    fetchSubtopics();
  }, [selectedTopics, supabase]);

  // Live matching count (debounced slightly by effect)
  useEffect(() => {
    async function fetchCount() {
      let query = supabase.from('questions').select('join_key', { count: 'exact', head: true });
      if (excludeIncomplete) query = query.or('is_incomplete.is.null,is_incomplete.eq.false');
      if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
      if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);
      const { count, error } = await query;
      if (error) {
        setErrorMessage(`Could not count matching questions: ${formatSupabaseError(error)}`);
        setMatchingCount(0);
        return;
      }
      setErrorMessage(null);
      setMatchingCount(count || 0);
    }
    fetchCount();
  }, [excludeIncomplete, selectedTopics, selectedSubtopics, supabase]);

  const handleStart = async () => {
    if (matchingCount === 0) return;
    setErrorMessage(null);
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      setErrorMessage(userError?.message || 'You must be logged in to start a quiz.');
      setLoading(false);
      return;
    }

    // 1. Create session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: userData.user.id,
        timer_enabled: timerEnabled,
        section_filter: null,
      })
      .select('id')
      .single();

    if (sessionError || !sessionData) {
      console.error(sessionError);
      setLoading(false);
      return;
    }

    const sessionId = sessionData.id;

    // 2. Fetch randomized questions
    let query = supabase.from('questions').select('join_key');
    if (excludeIncomplete) query = query.or('is_incomplete.is.null,is_incomplete.eq.false');
    if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
    if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);

    const { data: qs, error: questionsError } = await query;
    if (questionsError) {
      setErrorMessage(`Could not load questions: ${formatSupabaseError(questionsError)}`);
      setLoading(false);
      return;
    }

    if (qs && qs.length > 0) {
      // Shuffle & limit
      const shuffled = [...qs].sort(() => 0.5 - Math.random());
      const selectedQs = questionCount === -1 ? shuffled : shuffled.slice(0, questionCount);
      const questionJoinKeys = selectedQs.map((q) => q.join_key);

      // 3. Set Store
      setConfig({ sessionId, timerEnabled, sectionFilter: null });
      setQuestionJoinKeys(questionJoinKeys);

      // 4. Navigate
      router.push(`/quiz/${sessionId}`);
    } else {
      setErrorMessage('No questions matched the selected filters.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Quiz Setup</h1>
          <p className="mt-2 text-[var(--color-muted)]">Configure your quiz parameters</p>
        </div>

        <div className="space-y-6 rounded-[var(--radius-card)] bg-[var(--color-card)] p-6">
          {/* Topic Filter */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white">Topics</label>
            {availableTopics.length > 0 ? (
              <ChipSelect
                options={availableTopics.map(formatTopic)}
                selectedOptions={selectedTopics.map(formatTopic)}
                onChange={(formattedSelection) => {
                  // Map back to slug (basic approach for this demo)
                  const mapBack = availableTopics.filter((t) =>
                    formattedSelection.includes(formatTopic(t))
                  );
                  setSelectedTopics(mapBack);
                }}
              />
            ) : (
              <div className="text-sm text-[var(--color-muted)]">No topics found.</div>
            )}
          </div>

          {/* Subtopic Filter */}
          {availableSubtopics.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Subtopics</label>
              <ChipSelect
                options={availableSubtopics.map(formatTopic)}
                selectedOptions={selectedSubtopics.map(formatTopic)}
                onChange={(formattedSelection) => {
                  const mapBack = availableSubtopics.filter((t) =>
                    formattedSelection.includes(formatTopic(t))
                  );
                  setSelectedSubtopics(mapBack);
                }}
              />
            </div>
          )}

          {/* Question Count & Timer */}
          <div className="flex flex-wrap gap-8">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Number of Questions</label>
              <PillToggle
                options={[
                  { id: 10, label: '10' },
                  { id: 20, label: '20' },
                  { id: 40, label: '40' },
                  { id: -1, label: 'All' },
                ]}
                selected={questionCount}
                onChange={(v) => setQuestionCount(v)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Timer</label>
              <PillToggle
                options={[
                  { id: true, label: 'ON (30s)' },
                  { id: false, label: 'OFF' },
                ]}
                selected={timerEnabled}
                onChange={(v) => setTimerEnabled(v as boolean)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Question Quality</label>
              <PillToggle
                options={[
                  { id: true, label: 'Complete Only' },
                  { id: false, label: 'Include Incomplete' },
                ]}
                selected={excludeIncomplete}
                onChange={(v) => setExcludeIncomplete(v as boolean)}
              />
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6">
          <div className="text-lg">
            Matching Questions: <span className="font-bold text-white">{matchingCount}</span>
          </div>
          <button
            onClick={handleStart}
            disabled={loading || matchingCount === 0}
            className="rounded-[var(--radius-button)] bg-blue-600 px-8 py-3 font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Quiz'}
          </button>
        </div>
      </main>
    </div>
  );
}
