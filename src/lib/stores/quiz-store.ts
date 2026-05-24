import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const QUIZ_STORAGE_KEY = 'medbank-quiz-storage';

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
  startQuiz: (config: QuizConfig, questionJoinKeys: string[]) => void;
  addAnswer: (answer: AnswerRecord, pointsAdded: number) => void;
  resetQuizState: () => void;
}

type PersistedQuizState = Partial<
  Pick<QuizState, 'config' | 'questionJoinKeys' | 'answers' | 'score' | 'streak' | 'maxStreak'>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStoredState(rawValue: string): Record<string, unknown> | null {
  const parsed = JSON.parse(rawValue) as unknown;
  if (!isRecord(parsed)) return null;

  const state = parsed.state;
  if (isRecord(state)) return state;

  return parsed;
}

export function readPersistedQuizState(): PersistedQuizState | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.sessionStorage.getItem(QUIZ_STORAGE_KEY);
    if (!rawValue) return null;

    const state = readStoredState(rawValue);
    if (!state) return null;

    const config = state.config;
    const questionJoinKeys = state.questionJoinKeys;
    const answers = state.answers;

    return {
      config:
        isRecord(config) &&
        typeof config.sessionId === 'string' &&
        typeof config.timerEnabled === 'boolean'
          ? {
              sessionId: config.sessionId,
              timerEnabled: config.timerEnabled,
              sectionFilter:
                typeof config.sectionFilter === 'string' ? config.sectionFilter : null,
            }
          : null,
      questionJoinKeys: Array.isArray(questionJoinKeys)
        ? questionJoinKeys.filter((joinKey): joinKey is string => typeof joinKey === 'string')
        : [],
      answers: Array.isArray(answers) ? (answers as AnswerRecord[]) : [],
      score: typeof state.score === 'number' ? state.score : 0,
      streak: typeof state.streak === 'number' ? state.streak : 0,
      maxStreak: typeof state.maxStreak === 'number' ? state.maxStreak : 0,
    };
  } catch (error) {
    console.error('Could not read persisted quiz state.', error);
    return null;
  }
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
      startQuiz: (config, questionJoinKeys) =>
        set({
          config,
          questionJoinKeys,
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
          questionJoinKeys: [],
          answers: [],
          score: 0,
          streak: 0,
          maxStreak: 0,
        }),
    }),
    {
      name: QUIZ_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        config: state.config,
        questionJoinKeys: state.questionJoinKeys,
        answers: state.answers,
        score: state.score,
        streak: state.streak,
        maxStreak: state.maxStreak,
      }),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('Could not hydrate quiz store.', error);
          }
          queueMicrotask(() => {
            useQuizStore.setState({ hasHydrated: true });
          });
        };
      },
    }
  )
);
