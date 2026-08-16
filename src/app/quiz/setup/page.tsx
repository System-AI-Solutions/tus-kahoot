'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { PillToggle } from '@/components/ui/PillToggle';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Header } from '@/components/Header';
import { ANSWER_LETTERS, isSubtopicTag, type SubtopicTag } from '@/lib/constants';
import { cn, formatTopic } from '@/lib/utils';
import {
  compareExamMeta,
  examGroupKey,
  formatExamLabel,
  parseExamSource,
  type ExamSourceMeta,
} from '@/lib/exam-source';
import {
  countExplanations,
  fetchAllExplanations,
  type QuestionExplanation,
} from '@/lib/explanations';
import {
  EMPTY_EXCLUSIONS,
  fetchExcludedSourceKeys,
  fetchFlaggedJoinKeys,
  isExcludedQuestion,
  sourceKeyForFile,
  type QuestionExclusions,
} from '@/lib/source-integrity';
import type { Database } from '@/lib/types/database';
import type { PdfQuestionRow } from '@/lib/pdf/question-pdf';

type QuestionRow = Database['public']['Tables']['questions']['Row'];
type SupabaseBrowserClient = ReturnType<typeof createClient>;
type RepeatMode = 'all' | 'unseen';

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

// PostgREST caps a single select at 1000 rows, so key fetches must paginate.
const QUERY_PAGE_SIZE = 1000;

function formatSupabaseError(error: SupabaseErrorLike) {
  return error.message || error.details || error.hint || error.code || 'Unknown Supabase error';
}

interface QuestionFilters {
  excludeIncomplete: boolean;
  topics: string[];
  subtopics: SubtopicTag[];
  searchFilter: string | null;
}

// One row of the candidate pool. source_file rides along with the key so
// flagged questions and quarantined exam papers can be dropped client-side.
interface PoolRow {
  joinKey: string;
  sourceFile: string | null;
}

// One exam paper as offered by the exam-source manager.
interface ExamSourceGroup {
  key: string;
  meta: ExamSourceMeta;
  label: string;
  total: number;
  flagged: number;
}

// Turns "tuberculosis, thyroid" into a PostgREST or() filter matching the
// question stem or any option. Characters with meaning in the or()/LIKE
// syntax are stripped so user input cannot break the query.
function buildSearchOrFilter(rawSearch: string): string | null {
  const terms = rawSearch
    .split(',')
    .map((term) => term.trim().replace(/[,()\\%_"']/g, ''))
    .filter((term) => term.length >= 2);

  if (terms.length === 0) return null;

  const columns = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
  return terms
    .flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`))
    .join(',');
}

function buildPoolQuery(
  supabase: SupabaseBrowserClient,
  filters: QuestionFilters,
  options?: { countOnly?: boolean }
) {
  let query = supabase
    .from('questions')
    .select('join_key, source_file', options?.countOnly ? { count: 'exact', head: true } : undefined)
    .not('join_key', 'is', null)
    .in('correct_answer', [...ANSWER_LETTERS]);

  if (filters.excludeIncomplete) query = query.or('is_incomplete.is.null,is_incomplete.eq.false');
  if (filters.topics.length > 0) query = query.in('topic', filters.topics);
  if (filters.subtopics.length > 0) query = query.in('subtopic', filters.subtopics);
  if (filters.searchFilter) query = query.or(filters.searchFilter);

  return query;
}

async function fetchMatchingPoolRows(
  supabase: SupabaseBrowserClient,
  filters: QuestionFilters
): Promise<PoolRow[]> {
  const rows: PoolRow[] = [];

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await buildPoolQuery(supabase, filters).range(
      from,
      from + QUERY_PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(`Could not load questions: ${formatSupabaseError(error)}`);
    }

    const batch = data || [];
    for (const row of batch) {
      if (typeof row.join_key === 'string' && row.join_key.length > 0) {
        rows.push({ joinKey: row.join_key, sourceFile: row.source_file });
      }
    }

    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return rows;
}

function groupPoolRowsByExam(
  rows: PoolRow[],
  flaggedJoinKeys: Set<string>
): ExamSourceGroup[] {
  const byKey = new Map<string, ExamSourceGroup>();

  for (const row of rows) {
    const meta = parseExamSource(row.sourceFile);
    const key = examGroupKey(meta);
    let group = byKey.get(key);
    if (!group) {
      group = { key, meta, label: formatExamLabel(meta), total: 0, flagged: 0 };
      byKey.set(key, group);
    }
    group.total += 1;
    if (flaggedJoinKeys.has(row.joinKey)) group.flagged += 1;
  }

  return [...byKey.values()].sort((a, b) => compareExamMeta(a.meta, b.meta));
}

// RLS limits attempts to the signed-in user's own rows.
async function fetchAttemptedJoinKeys(supabase: SupabaseBrowserClient): Promise<Set<string>> {
  const attempted = new Set<string>();

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('attempts')
      .select('join_key')
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Could not load your previous attempts: ${formatSupabaseError(error)}`);
    }

    const batch = data || [];
    for (const row of batch) {
      if (typeof row.join_key === 'string' && row.join_key.length > 0) {
        attempted.add(row.join_key);
      }
    }

    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return attempted;
}

const PDF_COLUMNS =
  'join_key, question_number, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, source_file';

interface PdfQuestionRowsResult {
  rows: PdfQuestionRow[];
  omittedFlaggedCount: number;
  omittedSourceCount: number;
}

// Full question rows for the printable study paper. Only rows with a usable
// stem and a valid answer letter are kept; nullable option columns collapse to
// empty strings so the PDF renderer always receives clean strings. Explanations
// are attached by join_key when the export asks for them. Flagged questions and
// excluded exam sources are dropped and counted so the PDF can say what it left
// out.
async function fetchMatchingQuestionRows(
  supabase: SupabaseBrowserClient,
  filters: QuestionFilters,
  explanations: Map<string, QuestionExplanation> | null,
  exclusions: QuestionExclusions,
  includeFlagged: boolean
): Promise<PdfQuestionRowsResult> {
  const rows: PdfQuestionRow[] = [];
  let omittedFlaggedCount = 0;
  let omittedSourceCount = 0;

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    let query = supabase
      .from('questions')
      .select(PDF_COLUMNS)
      .not('join_key', 'is', null)
      .in('correct_answer', [...ANSWER_LETTERS]);

    if (filters.excludeIncomplete) query = query.or('is_incomplete.is.null,is_incomplete.eq.false');
    if (filters.topics.length > 0) query = query.in('topic', filters.topics);
    if (filters.subtopics.length > 0) query = query.in('subtopic', filters.subtopics);
    if (filters.searchFilter) query = query.or(filters.searchFilter);

    const { data, error } = await query.range(from, from + QUERY_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Could not load questions: ${formatSupabaseError(error)}`);
    }

    const batch = (data || []) as Array<Database['public']['Tables']['questions']['Row']>;
    for (const row of batch) {
      if (!row.question_text || !row.correct_answer) continue;
      if (!includeFlagged && exclusions.flaggedJoinKeys.has(row.join_key)) {
        omittedFlaggedCount += 1;
        continue;
      }
      if (
        exclusions.excludedSourceKeys.size > 0 &&
        exclusions.excludedSourceKeys.has(sourceKeyForFile(row.source_file))
      ) {
        omittedSourceCount += 1;
        continue;
      }
      rows.push({
        question_number: row.question_number ?? null,
        question_text: row.question_text,
        option_a: row.option_a ?? '',
        option_b: row.option_b ?? '',
        option_c: row.option_c ?? '',
        option_d: row.option_d ?? '',
        option_e: row.option_e ?? null,
        correct_answer: row.correct_answer,
        source_file: row.source_file ?? null,
        explanation: explanations?.get(row.join_key) ?? null,
      });
    }

    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return { rows, omittedFlaggedCount, omittedSourceCount };
}

export default function QuizSetupPage() {
  const supabase = useMemo(() => createClient(), []);

  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [availableSubtopics, setAvailableSubtopics] = useState<SubtopicTag[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<SubtopicTag[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(true);
  const [excludeIncomplete, setExcludeIncomplete] = useState<boolean>(true);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [pdfAnswerKey, setPdfAnswerKey] = useState<boolean>(true);
  const [pdfExplanations, setPdfExplanations] = useState<boolean>(true);
  const [pdfIncludeFlagged, setPdfIncludeFlagged] = useState<boolean>(false);
  const [explanationCount, setExplanationCount] = useState<number>(0);

  const [matchingCount, setMatchingCount] = useState<number>(0);
  const [totalMatchingCount, setTotalMatchingCount] = useState<number>(0);
  const [excludedCount, setExcludedCount] = useState<number>(0);
  const [countLoading, setCountLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [flaggedJoinKeys, setFlaggedJoinKeys] = useState<Set<string>>(
    () => EMPTY_EXCLUSIONS.flaggedJoinKeys
  );
  const [excludedSourceKeys, setExcludedSourceKeys] = useState<Set<string>>(
    () => EMPTY_EXCLUSIONS.excludedSourceKeys
  );
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [sourceGroups, setSourceGroups] = useState<ExamSourceGroup[]>([]);
  const [sourceGroupsLoading, setSourceGroupsLoading] = useState(false);
  const [pendingSourceKey, setPendingSourceKey] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const exclusions: QuestionExclusions = useMemo(
    () => ({ flaggedJoinKeys, excludedSourceKeys }),
    [flaggedJoinKeys, excludedSourceKeys]
  );
  const hasExclusions = flaggedJoinKeys.size > 0 || excludedSourceKeys.size > 0;

  // Seed the keyword search from ?q= (used by the sidebar search box).
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('q');
    if (query) setSearchInput(query);
  }, []);

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

  // Explanations are optional content, so the export toggle only appears once
  // at least one question has one.
  useEffect(() => {
    let cancelled = false;

    async function fetchExplanationCount() {
      const count = await countExplanations(supabase);
      if (!cancelled) setExplanationCount(count);
    }
    fetchExplanationCount();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // The user's own quarantine lists. Both reads degrade to empty sets, so a
  // missing table simply means nothing is excluded.
  useEffect(() => {
    let cancelled = false;

    async function fetchQuarantine() {
      const [flagged, excluded] = await Promise.all([
        fetchFlaggedJoinKeys(supabase),
        fetchExcludedSourceKeys(supabase),
      ]);
      if (cancelled) return;
      setFlaggedJoinKeys(flagged);
      setExcludedSourceKeys(excluded);
    }
    fetchQuarantine();

    return () => {
      cancelled = true;
    };
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

  // Live matching count, debounced for keyword typing.
  useEffect(() => {
    let cancelled = false;

    setCountLoading(true);
    const timerId = window.setTimeout(async () => {
      const filters: QuestionFilters = {
        excludeIncomplete,
        topics: selectedTopics,
        subtopics: selectedSubtopics,
        searchFilter: buildSearchOrFilter(searchInput),
      };

      try {
        // The cheap head count only tells the truth when nothing is flagged or
        // quarantined; otherwise the pool has to be listed and filtered here.
        if (repeatMode === 'all' && !hasExclusions) {
          const { count, error } = await buildPoolQuery(supabase, filters, { countOnly: true });
          if (error) {
            throw new Error(`Could not count matching questions: ${formatSupabaseError(error)}`);
          }
          if (!cancelled) {
            setMatchingCount(count || 0);
            setTotalMatchingCount(count || 0);
            setExcludedCount(0);
          }
        } else {
          const [poolRows, attemptedJoinKeys] = await Promise.all([
            fetchMatchingPoolRows(supabase, filters),
            repeatMode === 'unseen'
              ? fetchAttemptedJoinKeys(supabase)
              : Promise.resolve(new Set<string>()),
          ]);
          const usableRows = poolRows.filter((row) => !isExcludedQuestion(exclusions, row));
          const unseenRows =
            repeatMode === 'unseen'
              ? usableRows.filter((row) => !attemptedJoinKeys.has(row.joinKey))
              : usableRows;
          if (!cancelled) {
            setMatchingCount(unseenRows.length);
            setTotalMatchingCount(usableRows.length);
            setExcludedCount(poolRows.length - usableRows.length);
          }
        }
        if (!cancelled) {
          setErrorMessage(null);
          setCountLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not count questions.');
          setMatchingCount(0);
          setTotalMatchingCount(0);
          setExcludedCount(0);
          setCountLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    excludeIncomplete,
    selectedTopics,
    selectedSubtopics,
    searchInput,
    repeatMode,
    exclusions,
    hasExclusions,
    supabase,
  ]);

  // The exam-source manager lists the same pool grouped by exam paper, so it
  // only pays for that extra listing while the section is open.
  useEffect(() => {
    if (!sourceManagerOpen) return;

    let cancelled = false;

    setSourceGroupsLoading(true);
    const timerId = window.setTimeout(async () => {
      const filters: QuestionFilters = {
        excludeIncomplete,
        topics: selectedTopics,
        subtopics: selectedSubtopics,
        searchFilter: buildSearchOrFilter(searchInput),
      };

      try {
        const poolRows = await fetchMatchingPoolRows(supabase, filters);
        if (cancelled) return;
        setSourceGroups(groupPoolRowsByExam(poolRows, flaggedJoinKeys));
        setSourceError(null);
      } catch (error) {
        if (!cancelled) {
          setSourceError(
            error instanceof Error ? error.message : 'Could not load exam sources.'
          );
          setSourceGroups([]);
        }
      } finally {
        if (!cancelled) setSourceGroupsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    sourceManagerOpen,
    excludeIncomplete,
    selectedTopics,
    selectedSubtopics,
    searchInput,
    flaggedJoinKeys,
    supabase,
  ]);

  const toggleSourceExclusion = async (group: ExamSourceGroup) => {
    if (pendingSourceKey) return;
    setPendingSourceKey(group.key);
    setSourceError(null);

    const wasExcluded = excludedSourceKeys.has(group.key);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      setSourceError('You must be logged in to change exam sources.');
      setPendingSourceKey(null);
      return;
    }

    const { error } = wasExcluded
      ? await supabase
          .from('source_exclusions')
          .delete()
          .eq('user_id', userData.user.id)
          .eq('source_key', group.key)
      : await supabase
          .from('source_exclusions')
          .upsert(
            { user_id: userData.user.id, source_key: group.key },
            { onConflict: 'user_id,source_key', ignoreDuplicates: true }
          );

    if (error) {
      setSourceError(`Could not update this exam source: ${formatSupabaseError(error)}`);
      setPendingSourceKey(null);
      return;
    }

    setExcludedSourceKeys((previous) => {
      const next = new Set(previous);
      if (wasExcluded) next.delete(group.key);
      else next.add(group.key);
      return next;
    });
    setPendingSourceKey(null);
  };

  const handleStart = async () => {
    if (matchingCount === 0) return;
    setErrorMessage(null);
    setLoading(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error(userError?.message || 'You must be logged in to start a quiz.');
      }

      // 1. Fetch and validate questions before creating a session.
      const filters: QuestionFilters = {
        excludeIncomplete,
        topics: selectedTopics,
        subtopics: selectedSubtopics,
        searchFilter: buildSearchOrFilter(searchInput),
      };

      const poolRows = await fetchMatchingPoolRows(supabase, filters);
      const usableRows = poolRows.filter((row) => !isExcludedQuestion(exclusions, row));

      if (usableRows.length === 0 && poolRows.length > 0) {
        throw new Error(
          'Every matching question is flagged or comes from an excluded exam source. Clear a flag or switch a source back on to practise them.'
        );
      }

      let availableJoinKeys = usableRows.map((row) => row.joinKey);

      if (repeatMode === 'unseen') {
        const attemptedJoinKeys = await fetchAttemptedJoinKeys(supabase);
        availableJoinKeys = availableJoinKeys.filter((joinKey) => !attemptedJoinKeys.has(joinKey));

        if (availableJoinKeys.length === 0) {
          throw new Error(
            'You have already answered every question matching these filters. Switch "Question Pool" to "Allow Repeats" to practice them again.'
          );
        }
      }

      const shuffled = [...availableJoinKeys].sort(() => 0.5 - Math.random());
      const questionJoinKeys = questionCount === -1 ? shuffled : shuffled.slice(0, questionCount);

      if (questionJoinKeys.length === 0) {
        throw new Error('No questions matched the selected filters.');
      }

      // 2. Create session only after the question set is known to be valid.
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
        throw new Error(`Could not create quiz session: ${sessionError ? formatSupabaseError(sessionError) : 'No session returned'}`);
      }

      const sessionId = sessionData.id;

      useQuizStore.getState().startQuiz(
        { sessionId, timerEnabled, sectionFilter: null },
        questionJoinKeys
      );
      window.setTimeout(() => {
        window.location.assign(`/quiz/${sessionId}`);
      }, 0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not start quiz.');
      setLoading(false);
    }
  };

  // Printable study paper: no quiz session is created and answers are never
  // shown next to the questions. Uses the same topic/subtopic/quality/search
  // filters as the quiz, but always includes the whole matching set (the
  // "New Questions Only" pool is a quiz-only concept) so a subject can be
  // studied end to end.
  const handleDownloadPdf = async () => {
    if (matchingCount === 0 || downloadingPdf) return;
    setErrorMessage(null);
    setDownloadingPdf(true);

    try {
      const filters: QuestionFilters = {
        excludeIncomplete,
        topics: selectedTopics,
        subtopics: selectedSubtopics,
        searchFilter: buildSearchOrFilter(searchInput),
      };

      const includeExplanations = pdfExplanations && explanationCount > 0;
      const explanations = includeExplanations ? await fetchAllExplanations(supabase) : null;

      const { rows, omittedFlaggedCount, omittedSourceCount } = await fetchMatchingQuestionRows(
        supabase,
        filters,
        explanations,
        exclusions,
        pdfIncludeFlagged
      );
      if (rows.length === 0) {
        throw new Error(
          omittedFlaggedCount + omittedSourceCount > 0
            ? 'Every matching question is flagged or comes from an excluded exam source.'
            : 'No questions matched the selected filters.'
        );
      }

      const filterParts: string[] = [];
      if (searchInput.trim()) filterParts.push(`Search: ${searchInput.trim()}`);
      if (selectedTopics.length > 0) {
        filterParts.push(`Topics: ${selectedTopics.map(formatTopic).join(', ')}`);
      }
      if (selectedSubtopics.length > 0) {
        filterParts.push(`Subtopics: ${selectedSubtopics.map(formatTopic).join(', ')}`);
      }

      const { downloadQuestionPdf } = await import('@/lib/pdf/question-pdf');
      await downloadQuestionPdf(rows, {
        filtersSummary: filterParts.length > 0 ? filterParts.join(' • ') : 'All questions',
        includeAnswerKey: pdfAnswerKey,
        includeExplanations,
        omittedFlaggedCount,
        omittedSourceCount,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not generate the PDF.');
    } finally {
      setDownloadingPdf(false);
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
          {/* Keyword Search */}
          <div className="space-y-2">
            <label htmlFor="keyword-search" className="text-sm font-semibold text-white">
              Keyword Search
            </label>
            <input
              id="keyword-search"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="e.g. tuberculosis, thyroid, proteinuria — separate terms with commas"
              className="w-full rounded-[var(--radius-button)] bg-[var(--color-surface)] px-4 py-3 text-sm text-white placeholder-[var(--color-muted)] outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-[var(--color-muted)]">
              Matches the question text and answer options. Combine with topics below to narrow
              further.
            </p>
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
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Question Pool</label>
              <PillToggle
                options={[
                  { id: 'all', label: 'Allow Repeats' },
                  { id: 'unseen', label: 'New Questions Only' },
                ]}
                selected={repeatMode}
                onChange={(v) => setRepeatMode(v as RepeatMode)}
              />
              <p className="max-w-md text-xs text-[var(--color-muted)]">
                &quot;New Questions Only&quot; skips every question you have answered before, so a
                20-question quiz never repeats until you have worked through the whole pool.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">PDF Answer Key</label>
              <PillToggle
                options={[
                  { id: true, label: 'Last Pages' },
                  { id: false, label: 'No Answers' },
                ]}
                selected={pdfAnswerKey}
                onChange={(v) => setPdfAnswerKey(v as boolean)}
              />
              <p className="max-w-md text-xs text-[var(--color-muted)]">
                Only affects the downloaded PDF. Answers never appear next to the questions
                either way — the key, if included, sits on separate pages at the end.
              </p>
            </div>
            {explanationCount > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">PDF Explanations</label>
                <PillToggle
                  options={[
                    { id: true, label: 'Include' },
                    { id: false, label: 'Skip' },
                  ]}
                  selected={pdfExplanations}
                  onChange={(v) => setPdfExplanations(v as boolean)}
                />
                <p className="max-w-md text-xs text-[var(--color-muted)]">
                  Adds an Explanations section after the answer key, with the reasoning for the
                  correct answer and the notes on each wrong option. Only questions that have an
                  explanation appear there.
                </p>
              </div>
            )}
            {flaggedJoinKeys.size > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">PDF Flagged Questions</label>
                <PillToggle
                  options={[
                    { id: false, label: 'Leave Out' },
                    { id: true, label: 'Include' },
                  ]}
                  selected={pdfIncludeFlagged}
                  onChange={(v) => setPdfIncludeFlagged(v as boolean)}
                />
                <p className="max-w-md text-xs text-[var(--color-muted)]">
                  You have flagged {flaggedJoinKeys.size} question
                  {flaggedJoinKeys.size === 1 ? '' : 's'}. They stay out of the PDF unless you
                  include them here. Excluded exam sources are always left out.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-6">
          <button
            type="button"
            onClick={() => setSourceManagerOpen((open) => !open)}
            className="flex w-full items-start justify-between gap-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                Exam Sources
                {excludedSourceKeys.size > 0 && (
                  <span className="ml-2 rounded-[var(--radius-chip)] bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-200">
                    {excludedSourceKeys.size} excluded
                  </span>
                )}
              </span>
              <span className="mt-1 block max-w-2xl text-xs text-[var(--color-muted)]">
                Switch off a whole exam paper when its question numbers do not line up with the
                official file. Excluded papers and flagged questions never enter a quiz or a PDF.
              </span>
            </span>
            <ChevronDownIcon
              className={cn(
                'h-5 w-5 shrink-0 text-[var(--color-muted)] transition-transform',
                sourceManagerOpen && 'rotate-180'
              )}
            />
          </button>

          {sourceManagerOpen && (
            <div className="mt-4 space-y-3">
              {sourceError && (
                <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {sourceError}
                </div>
              )}

              {sourceGroupsLoading && sourceGroups.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">Loading exam sources...</p>
              ) : sourceGroups.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  No exam sources match the current filters.
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {sourceGroups.map((group) => {
                    const isExcluded = excludedSourceKeys.has(group.key);
                    const isPending = pendingSourceKey === group.key;

                    return (
                      <div
                        key={group.key}
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-button)] border p-3',
                          isExcluded
                            ? 'border-red-500/30 bg-[var(--color-surface)]/40 opacity-70'
                            : 'border-[var(--color-surface)] bg-[var(--color-surface)]'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {group.label}
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">
                            {group.total} question{group.total === 1 ? '' : 's'}
                            {group.flagged > 0 && ` · ${group.flagged} flagged`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isExcluded && (
                            <span className="rounded-[var(--radius-chip)] bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200">
                              Excluded
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleSourceExclusion(group)}
                            disabled={isPending || pendingSourceKey !== null}
                            className="rounded-[var(--radius-button)] border border-white/25 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
                          >
                            {isPending ? 'Saving...' : isExcluded ? 'Use Again' : 'Exclude'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-lg">
              {repeatMode === 'unseen' ? (
                <>
                  Unseen Questions:{' '}
                  <span className="font-bold text-white">
                    {countLoading ? '…' : matchingCount}
                  </span>{' '}
                  <span className="text-sm text-[var(--color-muted)]">
                    of {countLoading ? '…' : totalMatchingCount} matching
                  </span>
                </>
              ) : (
                <>
                  Matching Questions:{' '}
                  <span className="font-bold text-white">
                    {countLoading ? '…' : matchingCount}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || countLoading || matchingCount === 0}
                className="rounded-[var(--radius-button)] border border-white/25 bg-transparent px-6 py-3 font-bold text-white transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
              >
                {downloadingPdf ? 'Preparing PDF...' : 'Download PDF'}
              </button>
              <button
                onClick={handleStart}
                disabled={loading || countLoading || matchingCount === 0}
                className="rounded-[var(--radius-button)] bg-blue-600 px-8 py-3 font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Start Quiz'}
              </button>
            </div>
          </div>
          {excludedCount > 0 && (
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              {excludedCount} matching question{excludedCount === 1 ? '' : 's'} left out: flagged or
              from an excluded exam source.
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Download PDF saves every matching question — no quiz, no timer — organised by exam year,
            1st/2nd exam and K/T, numbered as in the original exam. The &quot;New Questions Only&quot;
            pool is ignored so you get the whole subject; answers are never shown next to the
            questions.
          </p>
        </div>
      </main>
    </div>
  );
}
