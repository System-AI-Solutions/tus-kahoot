'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface UnflagButtonProps {
  flagId: string;
}

// Clears one flag from the flagged list. The question returns to the quiz pool
// and to the study-paper PDF straight away, so the list is refreshed after the
// row is gone.
export function UnflagButton({ flagId }: UnflagButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnflag = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('question_flags')
      .delete()
      .eq('id', flagId);

    if (deleteError) {
      setError(deleteError.message || 'Could not remove this flag.');
      setPending(false);
      return;
    }

    setPending(false);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleUnflag}
        disabled={pending}
        className="rounded-[var(--radius-button)] border border-white/25 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? 'Removing...' : 'Remove Flag'}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
