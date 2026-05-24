begin;

-- Diagnostic query for manual inspection before applying this migration:
--
-- select join_key, question_text, correct_answer, option_a, option_b, option_c, option_d, option_e
-- from public.questions
-- where correct_answer is null
--    or correct_answer not in ('A', 'B', 'C', 'D', 'E')
--    or case correct_answer
--         when 'A' then nullif(btrim(option_a), '') is null
--         when 'B' then nullif(btrim(option_b), '') is null
--         when 'C' then nullif(btrim(option_c), '') is null
--         when 'D' then nullif(btrim(option_d), '') is null
--         when 'E' then nullif(btrim(option_e), '') is null
--         else true
--       end;

do $$
declare
  violations jsonb;
begin
  select jsonb_agg(to_jsonb(violating_question))
  into violations
  from (
    select join_key, question_text, correct_answer
    from public.questions
    where correct_answer is null
       or correct_answer not in ('A', 'B', 'C', 'D', 'E')
       or case correct_answer
            when 'A' then nullif(btrim(option_a), '') is null
            when 'B' then nullif(btrim(option_b), '') is null
            when 'C' then nullif(btrim(option_c), '') is null
            when 'D' then nullif(btrim(option_d), '') is null
            when 'E' then nullif(btrim(option_e), '') is null
            else true
          end
    order by join_key
    limit 50
  ) as violating_question;

  if violations is not null then
    raise exception 'Cannot enforce playable question answers. Fix violating questions first: %', violations;
  end if;
end $$;

alter table public.questions
  alter column correct_answer set not null;

alter table public.questions
  drop constraint if exists questions_correct_answer_check,
  add constraint questions_correct_answer_check
    check (correct_answer in ('A', 'B', 'C', 'D', 'E'));

alter table public.questions
  drop constraint if exists questions_correct_answer_option_present_check,
  add constraint questions_correct_answer_option_present_check
    check (
      case correct_answer
        when 'A' then nullif(btrim(option_a), '') is not null
        when 'B' then nullif(btrim(option_b), '') is not null
        when 'C' then nullif(btrim(option_c), '') is not null
        when 'D' then nullif(btrim(option_d), '') is not null
        when 'E' then nullif(btrim(option_e), '') is not null
        else false
      end
    );

commit;
