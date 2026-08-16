-- Source integrity tools. The imported question bank claims a source file and
-- a question number per row, and those claims cannot always be trusted, so the
-- app needs two per-user quarantine lists:
--   question_flags     one row per question the user reported as wrong or
--                      mismatched against the official exam paper
--   source_exclusions  one row per exam paper the user pulled out of rotation,
--                      keyed on examGroupKey() from src/lib/exam-source.ts
-- Both are private to the user who wrote them, so RLS is own-rows-only for
-- every operation, matching attempts and bookmarks.

begin;

create table if not exists public.question_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  join_key text not null
    references public.questions(join_key)
    on delete cascade,
  reason text not null default 'source_mismatch'
    check (reason in ('source_mismatch', 'wrong_answer', 'broken_question', 'other')),
  note text,
  created_at timestamptz not null default now(),
  constraint question_flags_user_id_join_key_key unique (user_id, join_key)
);

create index if not exists question_flags_user_id_idx
  on public.question_flags (user_id);
create index if not exists question_flags_join_key_idx
  on public.question_flags (join_key);

create table if not exists public.source_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  created_at timestamptz not null default now(),
  constraint source_exclusions_user_id_source_key_key unique (user_id, source_key)
);

create index if not exists source_exclusions_user_id_idx
  on public.source_exclusions (user_id);

alter table public.question_flags enable row level security;
alter table public.source_exclusions enable row level security;

drop policy if exists "Users can select their own question flags" on public.question_flags;
drop policy if exists "Users can insert their own question flags" on public.question_flags;
drop policy if exists "Users can update their own question flags" on public.question_flags;
drop policy if exists "Users can delete their own question flags" on public.question_flags;

drop policy if exists "Users can select their own source exclusions" on public.source_exclusions;
drop policy if exists "Users can insert their own source exclusions" on public.source_exclusions;
drop policy if exists "Users can update their own source exclusions" on public.source_exclusions;
drop policy if exists "Users can delete their own source exclusions" on public.source_exclusions;

create policy "Users can select their own question flags"
on public.question_flags
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own question flags"
on public.question_flags
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own question flags"
on public.question_flags
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own question flags"
on public.question_flags
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select their own source exclusions"
on public.source_exclusions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own source exclusions"
on public.source_exclusions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own source exclusions"
on public.source_exclusions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own source exclusions"
on public.source_exclusions
for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
