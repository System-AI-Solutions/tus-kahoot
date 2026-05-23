-- Canonicalize question relationships on questions.join_key.
-- attempts and bookmarks are intentionally truncated because prior temporary
-- defaults polluted child join_key values with identifiers that did not point
-- at questions.join_key.

begin;

-- 1. Make sure the columns exist before cleanup. Existing UUID child columns are
-- converted to text after their bad defaults are removed.
alter table public.questions
  add column if not exists join_key text;

alter table public.attempts
  add column if not exists join_key text;

alter table public.bookmarks
  add column if not exists join_key text;

alter table public.attempts
  alter column join_key drop default,
  alter column join_key type text using join_key::text;

alter table public.bookmarks
  alter column join_key drop default,
  alter column join_key type text using join_key::text;

alter table public.questions
  alter column join_key drop default,
  alter column join_key type text using join_key::text;

-- 2. Wipe invalid child data while preserving the child tables and primary keys.
truncate table public.attempts, public.bookmarks;

-- 3. Drop old/wrong child relationships and uniqueness constraints.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'f'
      and conrelid in ('public.attempts'::regclass, 'public.bookmarks'::regclass)
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = conrelid
            and attname = 'question_id'
            and not attisdropped
        )
      ]::smallint[]
  loop
    execute format('alter table %s drop constraint if exists %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end $$;

alter table public.attempts
  drop constraint if exists attempts_join_key_fkey,
  drop constraint if exists attempts_question_id_fkey;

alter table public.bookmarks
  drop constraint if exists bookmarks_join_key_fkey,
  drop constraint if exists bookmarks_question_id_fkey,
  drop constraint if exists bookmarks_user_id_question_id_key,
  drop constraint if exists bookmarks_user_id_join_key_key;

-- Keep legacy question_id columns, if present, but make them non-authoritative
-- and nullable so child writes only need join_key.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attempts'
      and column_name = 'question_id'
  ) then
    alter table public.attempts alter column question_id drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookmarks'
      and column_name = 'question_id'
  ) then
    alter table public.bookmarks alter column question_id drop not null;
  end if;
end $$;

-- 4. Backfill missing parent join keys from the source file ID and question
-- number where enough source data exists.
update public.questions
set join_key = source_file_id || ':' || question::text
where join_key is null
  and source_file_id is not null
  and source_file_id <> ''
  and question is not null;

-- Fail before adding constraints if parent data violates the canonical rule.
do $$
begin
  if exists (select 1 from public.questions where join_key is null) then
    raise exception 'Cannot enforce questions.join_key NOT NULL: at least one question has no join_key and could not be backfilled.';
  end if;

  if exists (
    select 1
    from public.questions
    group by join_key
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce questions.join_key UNIQUE: duplicate join_key values exist in questions.';
  end if;
end $$;

alter table public.questions
  alter column join_key set not null;

-- 5. Enforce parent uniqueness. ADD CONSTRAINT has no IF NOT EXISTS, so use a
-- catalog check to tolerate partial prior migrations.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
      and a.attnum = any(c.conkey)
    where c.conrelid = 'public.questions'::regclass
      and c.contype = 'u'
      and a.attname = 'join_key'
      and cardinality(c.conkey) = 1
  ) then
    alter table public.questions
      add constraint questions_join_key_key unique (join_key);
  end if;
end $$;

-- 6. Enforce canonical child keys and relationships.
alter table public.attempts
  alter column join_key set not null,
  add constraint attempts_join_key_fkey
    foreign key (join_key)
    references public.questions(join_key)
    on delete cascade;

alter table public.bookmarks
  alter column join_key set not null,
  add constraint bookmarks_join_key_fkey
    foreign key (join_key)
    references public.questions(join_key)
    on delete cascade,
  add constraint bookmarks_user_id_join_key_key
    unique (user_id, join_key);

-- 7. Replace broad RLS ownership policies with explicit per-operation policies.
alter table public.questions enable row level security;
alter table public.sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.bookmarks enable row level security;

drop policy if exists "Questions are viewable by authenticated users" on public.questions;
drop policy if exists "Users can manage their own sessions" on public.sessions;
drop policy if exists "Users can manage their own attempts" on public.attempts;
drop policy if exists "Users can manage their own bookmarks" on public.bookmarks;

drop policy if exists "Authenticated users can read questions" on public.questions;

drop policy if exists "Users can select their own sessions" on public.sessions;
drop policy if exists "Users can insert their own sessions" on public.sessions;
drop policy if exists "Users can update their own sessions" on public.sessions;
drop policy if exists "Users can delete their own sessions" on public.sessions;

drop policy if exists "Users can select their own attempts" on public.attempts;
drop policy if exists "Users can insert their own attempts" on public.attempts;
drop policy if exists "Users can update their own attempts" on public.attempts;
drop policy if exists "Users can delete their own attempts" on public.attempts;

drop policy if exists "Users can select their own bookmarks" on public.bookmarks;
drop policy if exists "Users can insert their own bookmarks" on public.bookmarks;
drop policy if exists "Users can update their own bookmarks" on public.bookmarks;
drop policy if exists "Users can delete their own bookmarks" on public.bookmarks;

create policy "Authenticated users can read questions"
on public.questions
for select
to authenticated
using (true);

create policy "Users can select their own sessions"
on public.sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own sessions"
on public.sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own sessions"
on public.sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sessions"
on public.sessions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select their own attempts"
on public.attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own attempts"
on public.attempts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own attempts"
on public.attempts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own attempts"
on public.attempts
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select their own bookmarks"
on public.bookmarks
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own bookmarks"
on public.bookmarks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own bookmarks"
on public.bookmarks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own bookmarks"
on public.bookmarks
for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
