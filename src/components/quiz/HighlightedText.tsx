import React from 'react';
import { cn } from '@/lib/utils';

interface HighlightedTextProps {
  text: string;
  phrases: string[];
  // 'light' marks sit on the white question card, 'dark' ones on dark panels.
  tone?: 'light' | 'dark';
}

interface Range {
  start: number;
  end: number;
}

// Stems are Turkish, so case-insensitive matching needs locale folding
// (I/ı and İ/i). Offsets into the folded string are only valid on the
// original when folding kept the length, so fall back to the raw text if not.
function foldCase(value: string): string {
  const folded = value.toLocaleLowerCase('tr');
  return folded.length === value.length ? folded : value;
}

function findHighlightRanges(text: string, phrases: string[]): Range[] {
  const haystack = foldCase(text);
  const ranges: Range[] = [];

  for (const phrase of phrases) {
    const needle = foldCase(phrase.trim());
    if (needle.length === 0) continue;

    let from = 0;
    while (from < haystack.length) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }

  // Overlapping or repeated phrases merge into one clean mark.
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// Renders text with every occurrence of the given phrases marked, the way
// AMBOSS underlines the key clinical clues of a stem. Pure render with no
// hooks, so it works in server and client components alike. With no phrases
// (or none matching) the output is the plain text.
export function HighlightedText({ text, phrases, tone = 'dark' }: HighlightedTextProps) {
  const ranges = findHighlightRanges(text, phrases);
  if (ranges.length === 0) return <>{text}</>;

  const markClass = cn(
    'rounded-sm px-0.5',
    tone === 'light' ? 'bg-yellow-200 text-black' : 'bg-yellow-400/25 text-yellow-100'
  );

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={index} className={markClass}>
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
