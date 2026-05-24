begin;

alter table public.attempts
  add column if not exists question_number integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'question_number'
  ) then
    update public.attempts as attempt
    set question_number = question.question_number
    from public.questions as question
    where attempt.question_number is null
      and attempt.join_key = question.join_key;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'question'
  ) then
    update public.attempts as attempt
    set question_number = question.question
    from public.questions as question
    where attempt.question_number is null
      and attempt.join_key = question.join_key;
  else
    raise exception 'Cannot backfill attempts.question_number: questions has neither question_number nor question.';
  end if;
end $$;

do $$
declare
  violations jsonb;
begin
  select jsonb_agg(to_jsonb(violating_attempt))
  into violations
  from (
    select id, session_id, join_key
    from public.attempts
    where question_number is null
    order by created_at desc
    limit 50
  ) as violating_attempt;

  if violations is not null then
    raise exception 'Cannot enforce attempts.question_number NOT NULL. Fix attempts without matching questions first: %', violations;
  end if;
end $$;

alter table public.attempts
  alter column question_number set not null;

commit;
