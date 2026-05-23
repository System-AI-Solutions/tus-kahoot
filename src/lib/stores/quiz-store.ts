import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface QuizConfig {
  sessionId: string;
  sectionFilter: string | null;
  timerEnabled: boolean;
}

export interface AnswerRecord {
  joinKey: string;
  userAnswer: string | null;
  isCorrect: boolean;
  timeTakenMs: number;
}

interface QuizState {
  hasHydrated: boolean;
  config: QuizConfig | null;
  questionJoinKeys: string[];
  answers: AnswerRecord[];
  score: number;
  streak: number;
  maxStreak: number;
  
  setHasHydrated: (hasHydrated: boolean) => void;
  setConfig: (config: QuizConfig) => void;
  setQuestionJoinKeys: (joinKeys: string[]) => void;
  addAnswer: (answer: AnswerRecord, pointsAdded: number) => void;
  resetQuizState: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      config: null,
      questionJoinKeys: [],
      answers: [],
      score: 0,
      streak: 0,
      maxStreak: 0,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setConfig: (config) => set({ config }),
      setQuestionJoinKeys: (questionJoinKeys) => set({ questionJoinKeys }),
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
          questionJoinKeys: [],
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
        questionJoinKeys: state.questionJoinKeys,
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
