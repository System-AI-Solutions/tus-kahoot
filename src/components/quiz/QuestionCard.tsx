import React from 'react';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutline } from '@heroicons/react/24/outline';
import { createClient } from '@/lib/supabase/client';

interface QuestionCardProps {
  joinKey: string;
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
}

export function QuestionCard({ joinKey, questionNumber, totalQuestions, questionText }: QuestionCardProps) {
  const [bookmarked, setBookmarked] = React.useState(false);
  const supabase = React.useMemo(() => createClient(), []);

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
        <span className="rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-white">
          Question {questionNumber} of {totalQuestions}
        </span>
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
      <h2 className="text-xl font-bold leading-relaxed text-black">
        {questionText}
      </h2>
    </div>
  );
}
