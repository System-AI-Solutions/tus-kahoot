import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { formatTopic, cn } from '@/lib/utils';
import Link from 'next/link';
import { ANSWER_COLORS } from '@/lib/constants';

export default async function ReviewPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // @ts-ignore
  const { data: attempts } = await supabase
    .from('attempts')
    .select(`
      id,
      user_answer,
      questions (
        question,
        topic,
        question_text,
        correct_answer,
        option_a,
        option_b,
        option_c,
        option_d,
        option_e
      )
    `)
    .eq('is_correct', false)
    .order('created_at', { ascending: false });

  // Group by topic
  const grouped: Record<string, any[]> = {};
  if (attempts) {
    attempts.forEach((a) => {
      const q = a.questions;
      if (!grouped[q.topic]) grouped[q.topic] = [];
      // Prevent duplicates if answered wrong multiple times
      if (!grouped[q.topic].find((ext) => ext.questions.question === q.question)) {
        grouped[q.topic].push(a);
      }
    });
  }

  const topics = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen pb-12">
      <Header />
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-3xl font-bold text-white">Review Wrong Answers</h1>
        
        {topics.length > 0 ? (
          <div className="space-y-12">
            {topics.map((topic) => (
              <section key={topic}>
                <h2 className="mb-4 text-xl font-bold text-white border-b border-[var(--color-surface)] pb-2 flex items-center justify-between">
                  {formatTopic(topic)}
                  <span className="text-sm font-medium text-[var(--color-muted)] bg-[var(--color-surface)] px-3 py-1 rounded-full">
                    {grouped[topic].length} questions
                  </span>
                </h2>
                
                <div className="space-y-6">
                  {grouped[topic].map((a) => {
                    const q = a.questions;
                    const options = [
                      { letter: 'A', text: q.option_a },
                      { letter: 'B', text: q.option_b },
                      { letter: 'C', text: q.option_c },
                      { letter: 'D', text: q.option_d },
                    ];
                    if (q.option_e) options.push({ letter: 'E', text: q.option_e });

                    return (
                      <div key={a.id} className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-md">
                        <p className="mb-6 font-medium text-white">{q.question_text}</p>
                        
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {options.map((opt) => {
                            const isCorrect = opt.letter === q.correct_answer;
                            const isUserWrong = opt.letter === a.user_answer;
                            
                            let borderClass = 'border-[var(--color-surface)] text-[var(--color-muted)]';
                            let icon = '';
                            
                            if (isCorrect) {
                              borderClass = 'border-[var(--color-correct-banner)] text-white bg-[var(--color-correct-banner)]/10';
                              icon = '✓';
                            } else if (isUserWrong) {
                              borderClass = 'border-[var(--color-wrong-banner)] text-white bg-[var(--color-wrong-banner)]/10';
                              icon = '✗';
                            }

                            return (
                              <div key={opt.letter} className={cn("flex items-center gap-3 rounded border p-3", borderClass)}>
                                <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white", ANSWER_COLORS[opt.letter as keyof typeof ANSWER_COLORS])}>
                                  {opt.letter}
                                </div>
                                <span className={isCorrect || isUserWrong ? 'font-semibold' : ''}>{opt.text}</span>
                                <span className="ml-auto font-bold">{icon}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-12 text-center">
            <h3 className="text-lg font-bold text-white">No wrong answers found</h3>
            <p className="mt-2 text-[var(--color-muted)]">Great job! You haven't made any mistakes yet.</p>
            <Link href="/dashboard" className="mt-6 inline-block rounded bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700">
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
