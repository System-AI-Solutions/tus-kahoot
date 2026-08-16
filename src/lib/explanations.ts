import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerLetter } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

export type QuestionExplanation =
  Database['public']['Tables']['question_explanations']['Row'];

// Works with both the browser and the server Supabase client.
type ExplanationClient = SupabaseClient<Database>;

export const EXPLANATION_COLUMNS =
  'join_key, explanation, option_a_explanation, option_b_explanation, option_c_explanation, option_d_explanation, option_e_explanation, attending_tip, key_info, image_url, source_note, updated_at';

// PostgREST caps a single select at 1000 rows, and long in() lists blow up the
// request URL, so both fetch helpers below work in batches.
const KEY_BATCH_SIZE = 200;
const QUERY_PAGE_SIZE = 1000;

const OPTION_EXPLANATION_KEYS = {
  A: 'option_a_explanation',
  B: 'option_b_explanation',
  C: 'option_c_explanation',
  D: 'option_d_explanation',
  E: 'option_e_explanation',
} as const satisfies Record<AnswerLetter, keyof QuestionExplanation>;

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getOptionExplanation(
  explanation: QuestionExplanation | null | undefined,
  letter: AnswerLetter
): string | null {
  if (!explanation) return null;
  return cleanText(explanation[OPTION_EXPLANATION_KEYS[letter]]);
}

// The main panel text: the authored explanation, falling back to whatever note
// the correct option carries so a per-option-only row still reads well.
export function getMainExplanation(
  explanation: QuestionExplanation | null | undefined,
  correctLetter: AnswerLetter | null
): string | null {
  if (!explanation) return null;
  return (
    cleanText(explanation.explanation) ??
    (correctLetter ? getOptionExplanation(explanation, correctLetter) : null)
  );
}

export function hasExplanationContent(
  explanation: QuestionExplanation | null | undefined
): boolean {
  if (!explanation) return false;
  return [
    explanation.explanation,
    explanation.option_a_explanation,
    explanation.option_b_explanation,
    explanation.option_c_explanation,
    explanation.option_d_explanation,
    explanation.option_e_explanation,
    explanation.attending_tip,
    explanation.key_info,
    explanation.image_url,
  ].some((value) => cleanText(value) !== null);
}

function toExplanationMap(rows: QuestionExplanation[]): Map<string, QuestionExplanation> {
  return new Map(rows.map((row) => [row.join_key, row]));
}

// Explanations are optional content: when the table is missing or unreadable
// the quiz must behave exactly as it did before, so failures resolve to an
// empty map instead of bubbling up.
export async function fetchExplanationsByJoinKey(
  supabase: ExplanationClient,
  joinKeys: string[]
): Promise<Map<string, QuestionExplanation>> {
  const uniqueKeys = Array.from(new Set(joinKeys.filter((key) => key.length > 0)));
  if (uniqueKeys.length === 0) return new Map();

  const rows: QuestionExplanation[] = [];

  for (let from = 0; from < uniqueKeys.length; from += KEY_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('question_explanations')
      .select(EXPLANATION_COLUMNS)
      .in('join_key', uniqueKeys.slice(from, from + KEY_BATCH_SIZE));

    if (error) {
      console.error('Could not load answer explanations.', error);
      return toExplanationMap(rows);
    }

    rows.push(...((data ?? []) as QuestionExplanation[]));
  }

  return toExplanationMap(rows);
}

// Used by the study-paper export, where the question set can run to thousands
// of rows: the explanation table is small, so pull it whole and match locally.
export async function fetchAllExplanations(
  supabase: ExplanationClient
): Promise<Map<string, QuestionExplanation>> {
  const rows: QuestionExplanation[] = [];

  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('question_explanations')
      .select(EXPLANATION_COLUMNS)
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) {
      console.error('Could not load answer explanations.', error);
      break;
    }

    const batch = (data ?? []) as QuestionExplanation[];
    rows.push(...batch);
    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  return toExplanationMap(rows);
}

// Head count used to decide whether the explanation controls are worth showing
// at all. Returns 0 when the table is not reachable.
export async function countExplanations(supabase: ExplanationClient): Promise<number> {
  const { count, error } = await supabase
    .from('question_explanations')
    .select('join_key', { count: 'exact', head: true });

  if (error) {
    console.error('Could not count answer explanations.', error);
    return 0;
  }

  return count ?? 0;
}
