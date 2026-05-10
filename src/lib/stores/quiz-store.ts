import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface QuizConfig {
  sessionId: string;
  sectionFilter: string | null;
  timerEnabled: boolean;
}

export interface AnswerRecord {
  questionId: number;
  userAnswer: string | null;
  isCorrect: boolean;
  timeTakenMs: number;
}

interface QuizState {
  hasHydrated: boolean;
  config: QuizConfig | null;
  questionIds: number[];
  answers: AnswerRecord[];
  score: number;
  streak: number;
  maxStreak: number;
  
  setHasHydrated: (hasHydrated: boolean) => void;
  setConfig: (config: QuizConfig) => void;
  setQuestionIds: (ids: number[]) => void;
  startQuiz: (config: QuizConfig, questionIds: number[]) => void;
  addAnswer: (answer: AnswerRecord, pointsAdded: number) => void;
  resetQuizState: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      config: null,
      questionIds: [],
      answers: [],
      score: 0,
      streak: 0,
      maxStreak: 0,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setConfig: (config) => set({ config }),
      setQuestionIds: (questionIds) => set({ questionIds }),
      startQuiz: (config, questionIds) =>
        set({
          config,
          questionIds,
          answers: [],
          score: 0,
          streak: 0,
          maxStreak: 0,
        }),
      addAnswer: (answer, pointsAdded) =>
        set((state) => {
          const newStreak = answer.isCorrect ? state.streak + 1 : 0;
          return {
            answers: [...state.answers, answer],
            score: state.score + pointsAdded,
            streak: newStreak,
            maxStreak: Math.max(state.maxStreak, newStreak),
          };
        }),
      resetQuizState: () =>
        set({
          config: null,
          questionIds: [],
          answers: [],
          score: 0,
          streak: 0,
          maxStreak: 0,
        }),
    }),
    {
      name: 'medbank-quiz-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        config: state.config,
        questionIds: state.questionIds,
        answers: state.answers,
        score: state.score,
        streak: state.streak,
        maxStreak: state.maxStreak,
      }),
      onRehydrateStorage: (state) => {
        state.setHasHydrated(false);
        return (state) => {
          state?.setHasHydrated(true);
        };
      },
    }
  )
);
