import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { StatsStrip } from '@/components/StatsStrip';
import { TopicGrid } from '@/components/TopicGrid';
import Link from 'next/link';

type AttemptWithQuestion = {
  is_correct: boolean;
  questions: { topic: string | null } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch total questions count
  const { count: totalQuestions } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true });

  // Fetch sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*');

  const quizzesTaken = sessions?.length || 0;

  // Fetch attempts joined with questions for topic logic
  const { data } = await supabase
    .from('attempts')
    .select(`
      is_correct,
      questions!inner(topic)
    `);
  const attempts = data as unknown as AttemptWithQuestion[] | null;

  let overallAccuracy = 0;
  const topicMap: Record<string, { total: number; correct: number }> = {};

  if (attempts && attempts.length > 0) {
    const totalCorrect = attempts.filter((a) => a.is_correct).length;
    overallAccuracy = (totalCorrect / attempts.length) * 100;

    attempts.forEach((a) => {
      const topic = a.questions?.topic || 'untagged';
      if (!topicMap[topic]) topicMap[topic] = { total: 0, correct: 0 };
      topicMap[topic].total += 1;
      if (a.is_correct) topicMap[topic].correct += 1;
    });
  }

  const topicStats = Object.entries(topicMap).map(([topic, stats]) => ({
    topic,
    total_questions: stats.total,
    accuracy: (stats.correct / stats.total) * 100,
  }));

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 p-6">
        <StatsStrip
          totalQuestions={totalQuestions || 0}
          quizzesTaken={quizzesTaken}
          accuracy={overallAccuracy}
        />

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="rounded-[var(--radius-button)] bg-white px-6 py-3 font-semibold text-black transition-colors hover:bg-white/85"
          >
            Home
          </Link>
          <Link
            href="/quiz/setup"
            className="rounded-[var(--radius-button)] bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Start Quiz
          </Link>
          <Link
            href="/bookmarks"
            className="rounded-[var(--radius-button)] bg-[var(--color-surface)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--color-surface)]/80"
          >
            Review Bookmarks
          </Link>
          <Link
            href="/review"
            className="rounded-[var(--radius-button)] bg-[var(--color-surface)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--color-surface)]/80"
          >
            Review Wrong Answers
          </Link>
        </div>

        <section>
          <h2 className="mb-4 text-xl font-bold text-white">Topic Performance</h2>
          {topicStats.length > 0 ? (
            <TopicGrid topics={topicStats} />
          ) : (
            <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-muted)]">
              Take some quizzes to see your topic performance here.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
