begin;

alter table public.attempts
  add column if not exists question_number bigint;

alter table public.attempts
  alter column question_number type bigint using question_number::bigint;

create or replace function public.fill_attempt_question_number_from_join_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question_number is null and new.join_key is not null then
    select question.question_number
    into new.question_number
    from public.questions as question
    where question.join_key = new.join_key;
  end if;

  return new;
end;
$$;

drop trigger if exists fill_attempt_question_number_from_join_key on public.attempts;

create trigger fill_attempt_question_number_from_join_key
before insert or update of join_key, question_number
on public.attempts
for each row
execute function public.fill_attempt_question_number_from_join_key();

update public.attempts as attempt
set question_number = question.question_number
from public.questions as question
where attempt.question_number is null
  and attempt.join_key = question.join_key;

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
