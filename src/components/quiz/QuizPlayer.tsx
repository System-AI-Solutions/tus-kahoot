'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuizStore } from '@/lib/stores/quiz-store';
import { QuizTopBar } from './QuizTopBar';
import { QuestionCard } from './QuestionCard';
import { AnswerGrid } from './AnswerGrid';
import { FeedbackBanner } from './FeedbackBanner';
import { TIMER_DURATION_MS } from '@/lib/constants';
import { calculateScore } from '@/lib/utils';

interface QuestionData {
  id: number;
  stem: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string | null;
  correct_answer: string;
}

interface AnswerOption {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

export function QuizPlayer({ questions }: { questions: QuestionData[] }) {
  const router = useRouter();
  const store = useQuizStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [status, setStatus] = useState<'default' | 'selected' | 'revealed'>('default');
  
  const [timeRemainingMs, setTimeRemainingMs] = useState(TIMER_DURATION_MS);
  const [pointsAdded, setPointsAdded] = useState(0);
  const [feedbackStatus, setFeedbackStatus] = useState<'correct' | 'wrong' | 'timeout' | null>(null);

  const activeQuestion = questions[currentIndex];

  // Map options
  const options = React.useMemo(() => {
    if (!activeQuestion) return [];
    const opts: AnswerOption[] = [
      { letter: 'A', text: activeQuestion.option_a },
      { letter: 'B', text: activeQuestion.option_b },
      { letter: 'C', text: activeQuestion.option_c },
      { letter: 'D', text: activeQuestion.option_d },
    ];
    if (activeQuestion.option_e) {
      opts.push({ letter: 'E', text: activeQuestion.option_e });
    }
    return opts;
  }, [activeQuestion]);

  // Handle Answer
  const handleAnswer = useCallback((letter: string | null, isTimeout: boolean = false) => {
    if (status !== 'default') return; // Prevent double firing
    if (!activeQuestion) return;
    
    setSelectedLetter(letter);
    setStatus('selected');

    // Simulate Kahoot delay
    setTimeout(() => {
      setStatus('revealed');
      
      const isCorrect = letter === activeQuestion.correct_answer;
      const points = isCorrect ? calculateScore(store.config?.timerEnabled || false, timeRemainingMs) : 0;
      
      setPointsAdded(points);

      if (isTimeout) {
        setFeedbackStatus('timeout');
      } else if (isCorrect) {
        setFeedbackStatus('correct');
      } else {
        setFeedbackStatus('wrong');
      }

      store.addAnswer({
        questionId: activeQuestion.id,
        userAnswer: letter,
        isCorrect,
        timeTakenMs: TIMER_DURATION_MS - timeRemainingMs,
      }, points);

    }, 1000); // 1s pretend-checking delay
  }, [activeQuestion, status, timeRemainingMs, store]);

  // Timer Effect
  useEffect(() => {
    if (status !== 'default' || !store.config?.timerEnabled) return;

    const interval = setInterval(() => {
      setTimeRemainingMs((prev) => Math.max(0, prev - 100)); // decrease smoothly
    }, 100);

    return () => clearInterval(interval);
  }, [status, store.config?.timerEnabled]);

  useEffect(() => {
    if (status !== 'default' || !store.config?.timerEnabled || timeRemainingMs > 0) return;

    const timeout = window.setTimeout(() => {
      handleAnswer(null, true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [timeRemainingMs, status, store.config?.timerEnabled, handleAnswer]);

  // Advance to next or results
  const nextQuestion = useCallback(() => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedLetter(null);
      setStatus('default');
      setFeedbackStatus(null);
      setTimeRemainingMs(TIMER_DURATION_MS);
    } else {
      router.push(`/quiz/${store.config?.sessionId}/results`);
    }
  }, [currentIndex, questions.length, router, store.config?.sessionId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status === 'default') {
        const letter = e.key.toUpperCase();
        if (['A', 'B', 'C', 'D', 'E'].includes(letter)) {
          // Check if option exists
          if (options.some((o) => o.letter === letter)) {
            handleAnswer(letter);
          }
        }
        if (e.code === 'Space') {
          handleAnswer(null); // Skip
        }
      } else if (status === 'revealed' && (e.code === 'Enter' || e.code === 'Space')) {
        nextQuestion();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, handleAnswer, nextQuestion, options]);

  // Before unload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  if (!activeQuestion) return null;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <QuizTopBar
        currentIndex={currentIndex}
        totalCount={questions.length}
        streak={store.streak}
        timerEnabled={store.config?.timerEnabled || false}
        timeRemainingMs={Math.max(0, timeRemainingMs)}
      />
      
      <FeedbackBanner 
        status={feedbackStatus} 
        pointsAdded={pointsAdded} 
        correctAnswerText={activeQuestion.correct_answer} 
      />

      <main className="flex flex-1 flex-col justify-center px-4 py-8">
        <QuestionCard 
          questionId={activeQuestion.id}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
          stem={activeQuestion.stem}
        />
        
        <div className="mx-auto mt-12 w-full max-w-4xl px-4">
          <AnswerGrid 
            options={options}
            selectedLetter={selectedLetter}
            correctLetter={activeQuestion.correct_answer}
            status={status}
            onSelect={handleAnswer}
          />
        </div>

        {status === 'revealed' && (
          <div className="mt-8 flex justify-center animate-in fade-in zoom-in">
            <button
              onClick={nextQuestion}
              className="rounded-[var(--radius-button)] bg-white px-8 py-4 text-xl font-bold text-black transition-transform hover:scale-105"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
