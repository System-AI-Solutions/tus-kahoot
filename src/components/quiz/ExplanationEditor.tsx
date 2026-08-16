'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EXPLANATION_COLUMNS, type QuestionExplanation } from '@/lib/explanations';
import type { AnswerLetter } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

type ExplanationInsert = Database['public']['Tables']['question_explanations']['Insert'];

interface ExplanationEditorProps {
  joinKey: string;
  explanation: QuestionExplanation | null;
  letters: AnswerLetter[];
  onSaved: (saved: QuestionExplanation) => void;
  onCancel: () => void;
}

interface Draft {
  explanation: string;
  option_a_explanation: string;
  option_b_explanation: string;
  option_c_explanation: string;
  option_d_explanation: string;
  option_e_explanation: string;
  attending_tip: string;
  key_info: string;
  image_url: string;
  source_note: string;
}

const OPTION_FIELDS = {
  A: 'option_a_explanation',
  B: 'option_b_explanation',
  C: 'option_c_explanation',
  D: 'option_d_explanation',
  E: 'option_e_explanation',
} as const satisfies Record<AnswerLetter, keyof Draft>;

function toDraft(explanation: QuestionExplanation | null): Draft {
  return {
    explanation: explanation?.explanation ?? '',
    option_a_explanation: explanation?.option_a_explanation ?? '',
    option_b_explanation: explanation?.option_b_explanation ?? '',
    option_c_explanation: explanation?.option_c_explanation ?? '',
    option_d_explanation: explanation?.option_d_explanation ?? '',
    option_e_explanation: explanation?.option_e_explanation ?? '',
    attending_tip: explanation?.attending_tip ?? '',
    key_info: explanation?.key_info ?? '',
    image_url: explanation?.image_url ?? '',
    source_note: explanation?.source_note ?? '',
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const FIELD_CLASS =
  'mt-1 block w-full rounded border border-[var(--color-surface)] bg-[#111] p-2 text-sm text-white focus:border-white focus:outline-none focus:ring-1 focus:ring-white';
const LABEL_CLASS = 'block text-xs font-semibold text-[var(--color-muted)]';

export function ExplanationEditor({
  joinKey,
  explanation,
  letters,
  onSaved,
  onCancel,
}: ExplanationEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(explanation));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof Draft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload: ExplanationInsert = {
      join_key: joinKey,
      explanation: orNull(draft.explanation),
      option_a_explanation: orNull(draft.option_a_explanation),
      option_b_explanation: orNull(draft.option_b_explanation),
      option_c_explanation: orNull(draft.option_c_explanation),
      option_d_explanation: orNull(draft.option_d_explanation),
      option_e_explanation: orNull(draft.option_e_explanation),
      attending_tip: orNull(draft.attending_tip),
      key_info: orNull(draft.key_info),
      image_url: orNull(draft.image_url),
      source_note: orNull(draft.source_note),
    };

    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from('question_explanations')
      .upsert(payload, { onConflict: 'join_key' })
      .select(EXPLANATION_COLUMNS)
      .single();

    if (saveError || !data) {
      setError(saveError?.message || 'Could not save the explanation.');
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved(data as unknown as QuestionExplanation);
  };

  return (
    <form
      onSubmit={handleSave}
      className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-surface)] bg-[var(--color-surface)] p-4"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
        Edit Explanation
      </p>

      {error && (
        <div className="rounded bg-red-900/50 p-3 text-sm text-red-200">{error}</div>
      )}

      <div>
        <label className={LABEL_CLASS} htmlFor={`explanation-${joinKey}`}>
          Main explanation (why the correct answer is correct)
        </label>
        <textarea
          id={`explanation-${joinKey}`}
          rows={5}
          value={draft.explanation}
          onChange={(event) => update('explanation', event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {letters.map((letter) => (
          <div key={letter}>
            <label className={LABEL_CLASS} htmlFor={`option-${letter}-${joinKey}`}>
              Option {letter} note
            </label>
            <textarea
              id={`option-${letter}-${joinKey}`}
              rows={3}
              value={draft[OPTION_FIELDS[letter]]}
              onChange={(event) => update(OPTION_FIELDS[letter], event.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor={`tip-${joinKey}`}>
            Attending tip (hint shown before answering)
          </label>
          <textarea
            id={`tip-${joinKey}`}
            rows={3}
            value={draft.attending_tip}
            onChange={(event) => update('attending_tip', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`key-info-${joinKey}`}>
            Key info (labs, exam findings, numbers)
          </label>
          <textarea
            id={`key-info-${joinKey}`}
            rows={3}
            value={draft.key_info}
            onChange={(event) => update('key_info', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor={`image-url-${joinKey}`}>
            Fact sheet image URL (optional)
          </label>
          <input
            id={`image-url-${joinKey}`}
            type="url"
            value={draft.image_url}
            onChange={(event) => update('image_url', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`source-note-${joinKey}`}>
            Source note (which document this came from)
          </label>
          <input
            id={`source-note-${joinKey}`}
            type="text"
            value={draft.source_note}
            onChange={(event) => update('source_note', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[var(--radius-button)] bg-white px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Explanation'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-[var(--radius-button)] border border-white/25 px-5 py-2 text-sm font-medium text-white transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
