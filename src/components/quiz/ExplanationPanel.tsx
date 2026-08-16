'use client';

import { useState } from 'react';
import { ChevronDownIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { ExplanationEditor } from './ExplanationEditor';
import {
  getMainExplanation,
  getOptionExplanation,
  hasExplanationContent,
  type QuestionExplanation,
} from '@/lib/explanations';
import { ANSWER_COLORS, type AnswerLetter } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface PanelOption {
  letter: AnswerLetter;
  text: string;
}

interface ExplanationPanelProps {
  joinKey: string;
  explanation: QuestionExplanation | null;
  options: PanelOption[];
  correctLetter: AnswerLetter | null;
  selectedLetter?: string | null;
  className?: string;
}

// AMBOSS-style panel that sits under the answers once the answer is revealed:
// key info, why the correct option is correct, then a collapsible note per
// option explaining why it is wrong. Renders nothing but the authoring button
// when the question has no explanation yet.
export function ExplanationPanel({
  joinKey,
  explanation,
  options,
  correctLetter,
  selectedLetter,
  className,
}: ExplanationPanelProps) {
  const [current, setCurrent] = useState<QuestionExplanation | null>(explanation);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [openLetters, setOpenLetters] = useState<AnswerLetter[]>(() => {
    const picked = options.find(
      (option) => option.letter === selectedLetter && option.letter !== correctLetter
    );
    return picked && getOptionExplanation(explanation, picked.letter) ? [picked.letter] : [];
  });

  const mainExplanation = getMainExplanation(current, correctLetter);
  const keyInfo = current?.key_info?.trim() || null;
  const imageUrl = current?.image_url?.trim() || null;
  const sourceNote = current?.source_note?.trim() || null;
  const hasContent = hasExplanationContent(current);

  // The correct option's own note is only listed separately when it is not
  // already doing duty as the main explanation text.
  const optionNotes = options
    .map((option) => ({ ...option, note: getOptionExplanation(current, option.letter) }))
    .filter(
      (option): option is PanelOption & { note: string } =>
        Boolean(option.note) &&
        !(option.letter === correctLetter && !current?.explanation?.trim())
    );

  const toggleLetter = (letter: AnswerLetter) => {
    setOpenLetters((previous) =>
      previous.includes(letter)
        ? previous.filter((open) => open !== letter)
        : [...previous, letter]
    );
  };

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
          {hasContent ? 'Explanation' : 'No explanation yet'}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setSavedNotice(false);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-white/20 px-3 py-1 text-xs font-semibold text-[var(--color-muted)] transition-colors hover:border-white/50 hover:text-white"
          >
            <PencilSquareIcon className="h-4 w-4" />
            {hasContent ? 'Edit' : 'Add explanation'}
          </button>
        )}
      </div>

      {savedNotice && !editing && (
        <div className="rounded bg-green-900/40 p-3 text-sm text-green-200">
          Explanation saved.
        </div>
      )}

      {editing ? (
        <ExplanationEditor
          joinKey={joinKey}
          explanation={current}
          letters={options.map((option) => option.letter)}
          onSaved={(saved) => {
            setCurrent(saved);
            setEditing(false);
            setSavedNotice(true);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {keyInfo && (
            <div className="rounded-[var(--radius-card)] border border-blue-500/30 bg-blue-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-200">Key Info</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-blue-50">
                {keyInfo}
              </p>
            </div>
          )}

          {mainExplanation && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-correct-banner)]/40 bg-[var(--color-correct-banner)]/10 p-4">
              <p className="text-sm font-bold text-white">
                {correctLetter ? `Why ${correctLetter} is correct` : 'Why the answer is correct'}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--color-body)]">
                {mainExplanation}
              </p>
              {imageUrl && (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block w-fit rounded-[var(--radius-button)] border border-white/15 bg-black/30 p-2"
                >
                  {/* Fact sheet images are arbitrary remote URLs, so next/image
                      remote patterns cannot cover them. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Explanation fact sheet"
                    className="max-h-64 w-auto rounded"
                  />
                </a>
              )}
              {sourceNote && (
                <p className="mt-3 text-xs text-[var(--color-muted)]">Source: {sourceNote}</p>
              )}
            </div>
          )}

          {optionNotes.length > 0 && (
            <div className="divide-y divide-[var(--color-surface)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-surface)]">
              {optionNotes.map((option) => {
                const isOpen = openLetters.includes(option.letter);
                const isCorrect = option.letter === correctLetter;

                return (
                  <div key={option.letter}>
                    <button
                      type="button"
                      onClick={() => toggleLetter(option.letter)}
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white',
                          ANSWER_COLORS[option.letter]
                        )}
                      >
                        {option.letter}
                      </span>
                      <span className="flex-1 truncate text-sm text-white">{option.text}</span>
                      <span className="shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                        {isCorrect ? 'More on this' : 'Why not'}
                      </span>
                      <ChevronDownIcon
                        className={cn(
                          'h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform',
                          isOpen && 'rotate-180'
                        )}
                      />
                    </button>
                    {isOpen && (
                      <p className="whitespace-pre-line px-3 pb-3 pl-12 text-sm leading-relaxed text-[var(--color-body)]">
                        {option.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
