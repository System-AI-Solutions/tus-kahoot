-- AMBOSS-style answer explanations, one row per question keyed on the
-- canonical questions.join_key. Everything is nullable so a row can start as
-- just an attending tip and grow later; the app hides whatever is empty.
-- Single tenant study app: the operator authors the content in-app, so every
-- authenticated user may read and write these rows.

begin;

create table if not exists public.question_explanations (
  join_key text primary key
    references public.questions(join_key)
    on delete cascade,
  explanation text,
  option_a_explanation text,
  option_b_explanation text,
  option_c_explanation text,
  option_d_explanation text,
  option_e_explanation text,
  attending_tip text,
  key_info text,
  image_url text,
  source_note text,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_question_explanations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_question_explanations_updated_at on public.question_explanations;

create trigger touch_question_explanations_updated_at
before update on public.question_explanations
for each row
execute function public.touch_question_explanations_updated_at();

alter table public.question_explanations enable row level security;

drop policy if exists "Authenticated users can read question explanations" on public.question_explanations;
drop policy if exists "Authenticated users can insert question explanations" on public.question_explanations;
drop policy if exists "Authenticated users can update question explanations" on public.question_explanations;

create policy "Authenticated users can read question explanations"
on public.question_explanations
for select
to authenticated
using (true);

create policy "Authenticated users can insert question explanations"
on public.question_explanations
for insert
to authenticated
with check (true);

create policy "Authenticated users can update question explanations"
on public.question_explanations
for update
to authenticated
using (true)
with check (true);

commit;
