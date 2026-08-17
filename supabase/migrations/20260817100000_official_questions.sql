-- Official OSYM exam papers as reference text (issue #12): the ground truth
-- that imported question banks can be verified against. One row per question
-- of an official paper, keyed on the same exam group convention as
-- examGroupKey() in src/lib/exam-source.ts ("YYYY|examNo|track", e.g.
-- "2013|1|T") plus the official question number.
--
-- Rows are written by scripts/import-official-papers.mjs, which parses the
-- official PDF booklets (never committed - OSYM copyright). correct_answer
-- comes from the answer key printed at the end of each booklet; is_cancelled
-- marks questions OSYM annulled ("Iptal") in that key.

begin;

create table if not exists public.official_questions (
  exam_group_key text not null,
  source_file text not null,
  question_number integer not null
    check (question_number between 1 and 400),
  stem text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  option_e text,
  correct_answer text
    check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  is_cancelled boolean not null default false,
  parse_note text,
  imported_at timestamptz not null default now(),
  primary key (exam_group_key, question_number)
);

alter table public.official_questions enable row level security;

drop policy if exists "Authenticated users can read official questions" on public.official_questions;
drop policy if exists "Authenticated users can insert official questions" on public.official_questions;
drop policy if exists "Authenticated users can update official questions" on public.official_questions;

create policy "Authenticated users can read official questions"
on public.official_questions
for select
to authenticated
using (true);

-- Single tenant study app: the operator loads and corrects reference rows,
-- mirroring the question_explanations policy. The import script's service
-- role key bypasses RLS anyway; these cover authenticated in-app tooling.
create policy "Authenticated users can insert official questions"
on public.official_questions
for insert
to authenticated
with check (true);

create policy "Authenticated users can update official questions"
on public.official_questions
for update
to authenticated
using (true)
with check (true);

commit;
