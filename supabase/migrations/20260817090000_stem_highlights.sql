-- AMBOSS-style stem keyword highlighting (issue #15): the key clinical
-- phrases of a question stem, stored verbatim and matched case-insensitively
-- against the stem at render time. Lives on question_explanations so the
-- existing editor, RLS policies and updated_at trigger all apply as-is.

begin;

alter table public.question_explanations
  add column if not exists stem_highlights text[];

commit;
