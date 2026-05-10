import React from 'react';
import { cn } from '@/lib/utils';

export interface PillToggleProps<T extends string | number | boolean> {
  options: readonly { id: T; label: string }[];
  selected: T;
  onChange: (id: T) => void;
  className?: string;
}

export function PillToggle<T extends string | number | boolean>({
  options,
  selected,
  onChange,
  className,
}: PillToggleProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[var(--radius-button)] bg-[var(--color-surface)] p-1',
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = selected === opt.id;
        return (
          <button
            key={String(opt.id)}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors rounded-[var(--radius-button)]',
              isSelected
                ? 'bg-[var(--color-card)] text-white shadow'
                : 'text-[var(--color-muted)] hover:text-white hover:bg-[var(--color-surface)]/50'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
