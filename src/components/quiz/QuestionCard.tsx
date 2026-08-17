import React from 'react';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutline, LightBulbIcon } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';
import { QuestionFlagButton } from './QuestionFlagButton';
import { HighlightedText } from './HighlightedText';

interface QuestionCardProps {
  joinKey: string;
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  examSource?: string;
  // Raw source_file behind examSource, shown on hover so a claimed exam paper
  // can be checked against the original document.
  sourceFile?: string | null;
  attendingTip?: string | null;
  // Key stem phrases to mark, AMBOSS-style. The player only passes them once
  // the answer is revealed, so a highlight can never give the answer away.
  stemHighlights?: string[] | null;
}

export function QuestionCard({ joinKey, questionNumber, totalQuestions, questionText, examSource, sourceFile, attendingTip, stemHighlights }: QuestionCardProps) {
  const [bookmarked, setBookmarked] = React.useState(false);
  const [tipOpen, setTipOpen] = React.useState(false);
  const supabase = React.useMemo(() => createClient(), []);

  // The card is reused across questions, so the hint collapses again whenever
  // a new question arrives.
  React.useEffect(() => {
    setTipOpen(false);
  }, [joinKey]);

  React.useEffect(() => {
    async function checkBookmark() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('join_key', joinKey)
        .maybeSingle();
      
      if (data) setBookmarked(true);
      else setBookmarked(false);
    }
    checkBookmark();
  }, [joinKey, supabase]);

  const toggleBookmark = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (bookmarked) {
      await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('join_key', joinKey);
      setBookmarked(false);
    } else {
      await supabase
        .from('bookmarks')
        .insert({ user_id: user.id, join_key: joinKey });
      setBookmarked(true);
    }
  };

  return (
    <div className="mx-auto max-w-2xl rounded-[var(--radius-card)] bg-white p-6 shadow-xl relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-white">
            Question {questionNumber} of {totalQuestions}
          </span>
          {examSource && (
            <span
              title={sourceFile ? `Source file: ${sourceFile}` : 'No source file recorded'}
              className="rounded-[var(--radius-chip)] bg-blue-600/15 px-3 py-1 text-xs font-bold text-blue-700"
            >
              {examSource}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <QuestionFlagButton key={joinKey} joinKey={joinKey} tone="light" />
          <button
            onClick={toggleBookmark}
            className="text-[var(--color-muted)] hover:text-black transition-colors"
          >
            {bookmarked ? (
              <BookmarkSolid className="h-6 w-6 text-blue-600" />
            ) : (
              <BookmarkOutline className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
      <h2 className="text-xl font-bold leading-relaxed text-black">
        <HighlightedText text={questionText} phrases={stemHighlights ?? []} tone="light" />
      </h2>
      {attendingTip && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setTipOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800 transition-colors hover:bg-amber-100"
          >
            <LightBulbIcon className="h-4 w-4" />
            {tipOpen ? 'Hide Attending Tip' : 'Attending Tip'}
          </button>
          {tipOpen && (
            <p className="mt-3 whitespace-pre-line rounded-[var(--radius-button)] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              {attendingTip}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
