-- The live database has a stray UNIQUE constraint on attempts.join_key
-- (attempts_join_key_key). No migration in this repo creates it, but it means
-- a user can only ever answer a given question once across all sessions:
-- saving quiz results fails with
--   duplicate key value violates unique constraint "attempts_join_key_key"
-- Replace it with per-session uniqueness so questions can be re-attempted in
-- later quizzes while result saving stays idempotent.

begin;

alter table public.attempts
  drop constraint if exists attempts_join_key_key;

-- The same rule may exist as a standalone unique index rather than a table
-- constraint, depending on how it was originally created.
drop index if exists public.attempts_join_key_key;

-- Deduplicate rows that would violate per-session uniqueness, keeping the most
-- recent attempt for each (session_id, join_key).
delete from public.attempts as attempt
using public.attempts as duplicate
where attempt.session_id = duplicate.session_id
  and attempt.join_key = duplicate.join_key
  and (coalesce(attempt.created_at, timestamptz 'epoch'), attempt.id)
    < (coalesce(duplicate.created_at, timestamptz 'epoch'), duplicate.id);

-- A question appears at most once within a session, so enforce uniqueness per
-- session. This also lets the app upsert attempts safely on retry.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attempts'::regclass
      and conname = 'attempts_session_id_join_key_key'
  ) then
    alter table public.attempts
      add constraint attempts_session_id_join_key_key unique (session_id, join_key);
  end if;
end $$;

commit;
