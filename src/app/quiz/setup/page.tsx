'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { PillToggle } from '@/components/ui/PillToggle';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Header } from '@/components/Header';
import { SECTIONS, isSubtopicTag, type SubtopicTag } from '@/lib/constants';
import { formatTopic } from '@/lib/utils';
import type { Database } from '@/lib/types/database';

type QuestionRow = Database['public']['Tables']['questions']['Row'];

export default function QuizSetupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const setConfig = useQuizStore((state) => state.setConfig);
  const setQuestionIds = useQuizStore((state) => state.setQuestionIds);

  const [section, setSection] = useState<'all' | 'basic_sciences' | 'clinical_sciences'>('all');
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [availableSubtopics, setAvailableSubtopics] = useState<SubtopicTag[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<SubtopicTag[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(true);
  
  const [matchingCount, setMatchingCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Fetch topics dynamically
  useEffect(() => {
    async function fetchTopics() {
      let query = supabase.from('questions').select('topic');
      if (section !== 'all') {
        query = query.eq('section', section);
      }
      const { data } = await query;
      if (data) {
        const unique = Array.from(
          new Set(
            data
              .map((d: Pick<QuestionRow, 'topic'>) => d.topic)
              .filter((topic): topic is string => typeof topic === 'string' && topic.length > 0)
          )
        );
        setAvailableTopics(unique);
        setSelectedTopics([]); // reset selection on section change
      }
    }
    fetchTopics();
  }, [section, supabase]);

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
        );
        setAvailableSubtopics(unique);
        setSelectedSubtopics([]);
      }
    }
    fetchSubtopics();
  }, [selectedTopics, supabase]);

  // Live matching count (debounced slightly by effect)
  useEffect(() => {
    async function fetchCount() {
      let query = supabase.from('questions').select('*', { count: 'exact', head: true });
      if (section !== 'all') query = query.eq('section', section);
      if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
      if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);
      // In a real app we might join to attempts to check "exclude incomplete" 
      // but without complex RPC, we can just do a basic count for UX
      const { count } = await query;
      setMatchingCount(count || 0);
    }
    fetchCount();
  }, [section, selectedTopics, selectedSubtopics, supabase]);

  const handleStart = async () => {
    if (matchingCount === 0) return;
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setLoading(false);
      router.push('/login');
      return;
    }

    // 1. Create session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: userData.user.id,
        timer_enabled: timerEnabled,
        section_filter: section === 'all' ? null : section,
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
    let query = supabase.from('questions').select('id');
    if (section !== 'all') query = query.eq('section', section);
    if (selectedTopics.length > 0) query = query.in('topic', selectedTopics);
    if (selectedSubtopics.length > 0) query = query.in('subtopic', selectedSubtopics);

    const { data: qs } = await query;
    if (qs && qs.length > 0) {
      // Shuffle & limit
      const shuffled = [...qs].sort(() => 0.5 - Math.random());
      const selectedQs = questionCount === -1 ? shuffled : shuffled.slice(0, questionCount);
      const qIds = selectedQs.map((q) => q.id);

      // 3. Set Store
      setConfig({ sessionId, timerEnabled, sectionFilter: section === 'all' ? null : section });
      setQuestionIds(qIds);

      // 4. Navigate
      router.push(`/quiz/${sessionId}`);
    } else {
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
          {/* Section Filter */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white">Section</label>
            <PillToggle
              options={SECTIONS}
              selected={section}
              onChange={(v) => setSection(v as typeof section)}
            />
          </div>

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
          </div>
        </div>

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
