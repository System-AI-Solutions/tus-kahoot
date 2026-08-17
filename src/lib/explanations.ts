import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerLetter } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

export type QuestionExplanation =
  Database['public']['Tables']['question_explanations']['Row'];

// Works with both the browser and the server Supabase client.
type ExplanationClient = SupabaseClient<Database>;

export const EXPLANATION_COLUMNS =
  'join_key, explanation, option_a_explanation, option_b_explanation, option_c_explanation, option_d_explanation, option_e_explanation, attending_tip, key_info, image_url, source_note, stem_highlights, updated_at';

// stem_highlights ships in a later migration (20260817090000) than the table
// itself: selecting it from a database that only ran the table migration fails
// whole with 42703 (undefined column), which would silently drop every
// explanation. Reads retry once against the pre-highlight column list instead.
const LEGACY_EXPLANATION_COLUMNS =
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

// The stem phrases worth marking in the question text, cleaned for rendering.
// Rows read through the legacy column fallback simply lack the field.
export function getStemHighlights(
  explanation: QuestionExplanation | null | undefined
): string[] {
  if (!explanation?.stem_highlights) return [];
  return explanation.stem_highlights
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

function toExplanationMap(rows: QuestionExplanation[]): Map<string, QuestionExplanation> {
  return new Map(rows.map((row) => [row.join_key, row]));
}

type ExplanationSelectResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

async function selectExplanations(
  run: (columns: string) => PromiseLike<ExplanationSelectResult>
): Promise<{ rows: QuestionExplanation[]; error: ExplanationSelectResult['error'] }> {
  let result = await run(EXPLANATION_COLUMNS);
  if (result.error?.code === '42703') {
    result = await run(LEGACY_EXPLANATION_COLUMNS);
  }
  if (result.error) return { rows: [], error: result.error };
  return { rows: ((result.data ?? []) as QuestionExplanation[]), error: null };
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
    const batchKeys = uniqueKeys.slice(from, from + KEY_BATCH_SIZE);
    const { rows: batch, error } = await selectExplanations((columns) =>
      supabase.from('question_explanations').select(columns).in('join_key', batchKeys)
    );

    if (error) {
      console.error('Could not load answer explanations.', error);
      return toExplanationMap(rows);
    }

    rows.push(...batch);
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
    const { rows: batch, error } = await selectExplanations((columns) =>
      supabase
        .from('question_explanations')
        .select(columns)
        .range(from, from + QUERY_PAGE_SIZE - 1)
    );

    if (error) {
      console.error('Could not load answer explanations.', error);
      break;
    }

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
