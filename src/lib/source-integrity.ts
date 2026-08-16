import type { SupabaseClient } from '@supabase/supabase-js';
import { examGroupKey, parseExamSource } from '@/lib/exam-source';
import type { Database } from '@/lib/types/database';

export type QuestionFlag = Database['public']['Tables']['question_flags']['Row'];
export type FlagReason = QuestionFlag['reason'];

// Works with both the browser and the server Supabase client.
type IntegrityClient = SupabaseClient<Database>;

export const FLAG_COLUMNS = 'id, user_id, join_key, reason, note, created_at';

export const FLAG_REASONS = [
  { id: 'source_mismatch', label: 'Source mismatch' },
  { id: 'wrong_answer', label: 'Wrong answer' },
  { id: 'broken_question', label: 'Broken question' },
  { id: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{ id: FlagReason; label: string }>;

export function formatFlagReason(reason: string): string {
  return FLAG_REASONS.find((entry) => entry.id === reason)?.label ?? 'Other';
}

// PostgREST caps a single select at 1000 rows, and long in() lists blow up the
// request URL, so the fetch helpers below work in batches.
const KEY_BATCH_SIZE = 200;
const QUERY_PAGE_SIZE = 1000;

// The stable per-exam-paper key stored in source_exclusions. Questions whose
// source_file cannot be parsed still get a key, so an unnamed batch can be
// quarantined too.
export function sourceKeyForFile(sourceFile: string | null | undefined): string {
  return examGroupKey(parseExamSource(sourceFile));
}

export interface QuestionExclusions {
  flaggedJoinKeys: Set<string>;
  excludedSourceKeys: Set<string>;
}

export const EMPTY_EXCLUSIONS: QuestionExclusions = {
  flaggedJoinKeys: new Set<string>(),
  excludedSourceKeys: new Set<string>(),
};

export function isExcludedQuestion(
  exclusions: QuestionExclusions,
  question: { joinKey: string; sourceFile: string | null | undefined }
): boolean {
  if (exclusions.flaggedJoinKeys.has(question.joinKey)) return true;
  if (exclusions.excludedSourceKeys.size === 0) return false;
  return exclusions.excludedSourceKeys.has(sourceKeyForFile(question.sourceFile));
}

// Flags and exclusions are optional extras layered on top of the question
// bank: when their tables are missing or unreadable the app must behave exactly
// as it did before, so every read below resolves to an empty result instead of
// bubbling an error up. RLS already limits these rows to the signed-in user.
export async function fetchFlaggedJoinKeys(supabase: IntegrityClient): Promise<Set<string>> {
  const flagged = new Set<string>();

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('question_flags')
      .select('join_key')
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) {
      console.error('Could not load your flagged questions.', error);
      break;
    }

    const batch = data ?? [];
    for (const row of batch) {
      if (typeof row.join_key === 'string' && row.join_key.length > 0) {
        flagged.add(row.join_key);
      }
    }

    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return flagged;
}

export async function fetchExcludedSourceKeys(supabase: IntegrityClient): Promise<Set<string>> {
  const excluded = new Set<string>();

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('source_exclusions')
      .select('source_key')
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) {
      console.error('Could not load your excluded exam sources.', error);
      break;
    }

    const batch = data ?? [];
    for (const row of batch) {
      if (typeof row.source_key === 'string' && row.source_key.length > 0) {
        excluded.add(row.source_key);
      }
    }

    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return excluded;
}

export async function fetchQuestionExclusions(
  supabase: IntegrityClient
): Promise<QuestionExclusions> {
  const [flaggedJoinKeys, excludedSourceKeys] = await Promise.all([
    fetchFlaggedJoinKeys(supabase),
    fetchExcludedSourceKeys(supabase),
  ]);

  return { flaggedJoinKeys, excludedSourceKeys };
}

// Full flag rows for a known set of questions, used where the reason and note
// have to be shown next to the question.
export async function fetchFlagsByJoinKey(
  supabase: IntegrityClient,
  joinKeys: string[]
): Promise<Map<string, QuestionFlag>> {
  const uniqueKeys = Array.from(new Set(joinKeys.filter((key) => key.length > 0)));
  if (uniqueKeys.length === 0) return new Map();

  const flags = new Map<string, QuestionFlag>();

  for (let from = 0; from < uniqueKeys.length; from += KEY_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('question_flags')
      .select(FLAG_COLUMNS)
      .in('join_key', uniqueKeys.slice(from, from + KEY_BATCH_SIZE));

    if (error) {
      console.error('Could not load your flagged questions.', error);
      return flags;
    }

    for (const row of (data ?? []) as QuestionFlag[]) {
      flags.set(row.join_key, row);
    }
  }

  return flags;
}
