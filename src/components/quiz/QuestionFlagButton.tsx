'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlagIcon as FlagSolid } from '@heroicons/react/24/solid';
import { FlagIcon as FlagOutline } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';
import {
  FLAG_COLUMNS,
  FLAG_REASONS,
  type FlagReason,
  type QuestionFlag,
} from '@/lib/source-integrity';
import { cn } from '@/lib/utils';

interface QuestionFlagButtonProps {
  // Give the element a key of this join_key wherever one card is reused across
  // questions: the remount is what resets the panel between questions.
  joinKey: string;
  // Pass a row (or null) when the parent already loaded the user's flags;
  // leave it undefined to let the button look its own flag up.
  initialFlag?: QuestionFlag | null;
  tone?: 'light' | 'dark';
  className?: string;
  onChange?: (flag: QuestionFlag | null) => void;
}

const NOTICE_MS = 2500;

// Report that a question does not match the exam paper it claims to come from.
// A flagged question is kept out of every quiz pool and out of the study-paper
// PDF, so this is the escape hatch for a batch the import got wrong.
export function QuestionFlagButton({
  joinKey,
  initialFlag,
  tone = 'dark',
  className,
  onChange,
}: QuestionFlagButtonProps) {
  const supabase = useMemo(() => createClient(), []);
  const [flag, setFlag] = useState<QuestionFlag | null>(initialFlag ?? null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason>(initialFlag?.reason ?? 'source_mismatch');
  const [note, setNote] = useState(initialFlag?.note ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isLight = tone === 'light';

  // Only look the flag up when the parent did not already provide it.
  useEffect(() => {
    if (initialFlag !== undefined) return;

    let cancelled = false;

    async function loadFlag() {
      const { data, error: loadError } = await supabase
        .from('question_flags')
        .select(FLAG_COLUMNS)
        .eq('join_key', joinKey)
        .maybeSingle();

      if (loadError) {
        console.error('Could not load the flag for this question.', loadError);
        return;
      }
      if (cancelled) return;

      const row = (data as QuestionFlag | null) ?? null;
      setFlag(row);
      setReason(row?.reason ?? 'source_mismatch');
      setNote(row?.note ?? '');
    }
    loadFlag();

    return () => {
      cancelled = true;
    };
  }, [joinKey, initialFlag, supabase]);

  useEffect(() => {
    if (!notice) return;

    const timerId = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timerId);
  }, [notice]);

  const applyFlag = (next: QuestionFlag | null) => {
    setFlag(next);
    onChange?.(next);
  };

  const handleSave = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      setError('You must be logged in to flag a question.');
      setPending(false);
      return;
    }

    const trimmedNote = note.trim();
    const { data, error: saveError } = await supabase
      .from('question_flags')
      .upsert(
        {
          user_id: userData.user.id,
          join_key: joinKey,
          reason,
          note: trimmedNote.length > 0 ? trimmedNote : null,
        },
        { onConflict: 'user_id,join_key' }
      )
      .select(FLAG_COLUMNS)
      .single();

    if (saveError || !data) {
      setError(saveError?.message || 'Could not save this flag.');
      setPending(false);
      return;
    }

    applyFlag(data as unknown as QuestionFlag);
    setPending(false);
    setOpen(false);
    setNotice('Flagged');
  };

  const handleRemove = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from('question_flags')
      .delete()
      .eq('join_key', joinKey);

    if (deleteError) {
      setError(deleteError.message || 'Could not remove this flag.');
      setPending(false);
      return;
    }

    applyFlag(null);
    setNote('');
    setReason('source_mismatch');
    setPending(false);
    setOpen(false);
    setNotice('Flag removed');
  };

  return (
    <div
      className={cn('relative flex items-center gap-2', className)}
      // The quiz player listens for A to E, Space and Enter on the window, so
      // key presses inside this panel must never reach it.
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {notice && (
        <span
          className={cn(
            'text-xs font-semibold',
            isLight ? 'text-neutral-500' : 'text-[var(--color-muted)]'
          )}
        >
          {notice}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-label={flag ? 'Edit the flag on this question' : 'Report a problem with this question'}
        title={flag ? 'Flagged: this question is left out of quizzes and PDFs' : 'Report a problem'}
        className={cn(
          'transition-colors',
          isLight
            ? 'text-[var(--color-muted)] hover:text-black'
            : 'text-[var(--color-muted)] hover:text-white'
        )}
      >
        {flag ? (
          <FlagSolid className={cn('h-5 w-5', isLight ? 'text-red-600' : 'text-red-400')} />
        ) : (
          <FlagOutline className="h-5 w-5" />
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-20 mt-2 w-72 space-y-3 rounded-[var(--radius-card)] border p-4 text-left shadow-xl',
            isLight
              ? 'border-neutral-200 bg-white'
              : 'border-white/10 bg-[var(--color-surface)]'
          )}
        >
          <p
            className={cn(
              'text-xs font-bold uppercase tracking-wide',
              isLight ? 'text-neutral-500' : 'text-[var(--color-muted)]'
            )}
          >
            {flag ? 'Edit flag' : 'Report a problem'}
          </p>

          {error && (
            <div className="rounded bg-red-900/50 p-2 text-xs text-red-200">{error}</div>
          )}

          <div className="flex flex-wrap gap-2">
            {FLAG_REASONS.map((entry) => {
              const isSelected = entry.id === reason;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setReason(entry.id)}
                  className={cn(
                    'rounded-[var(--radius-chip)] border px-3 py-1 text-xs transition-colors',
                    isSelected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : isLight
                        ? 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                        : 'border-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-muted)]'
                  )}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note, e.g. official 2013TUS_1T #61 is a heparin question"
            className={cn(
              'block w-full rounded border p-2 text-xs focus:outline-none focus:ring-1',
              isLight
                ? 'border-neutral-300 bg-white text-black placeholder-neutral-400 focus:border-neutral-500 focus:ring-neutral-500'
                : 'border-[var(--color-card)] bg-[#111] text-white placeholder-[var(--color-muted)] focus:border-white focus:ring-white'
            )}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-[var(--radius-button)] bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? 'Saving...' : flag ? 'Update flag' : 'Flag question'}
            </button>
            {flag && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={pending}
                className={cn(
                  'rounded-[var(--radius-button)] border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  isLight
                    ? 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                    : 'border-white/25 text-white hover:border-white/60 hover:bg-white/10'
                )}
              >
                Remove flag
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className={cn(
                'text-xs font-medium transition-colors disabled:opacity-50',
                isLight
                  ? 'text-neutral-500 hover:text-black'
                  : 'text-[var(--color-muted)] hover:text-white'
              )}
            >
              Cancel
            </button>
          </div>

          <p
            className={cn(
              'text-[11px] leading-relaxed',
              isLight ? 'text-neutral-500' : 'text-[var(--color-muted)]'
            )}
          >
            Flagged questions are skipped by new quizzes and by the study-paper PDF.
          </p>
        </div>
      )}
    </div>
  );
}
