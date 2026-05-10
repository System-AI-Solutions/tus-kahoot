export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      questions: {
        Row: {
          question: number
          question_text: string
          id?: string
          section: 'basic_sciences' | 'clinical_sciences'
          topic: string
          subtopic:
            | 'anatomy'
            | 'histology'
            | 'embryology'
            | 'physiology'
            | 'biochemistry'
            | 'microbiology'
            | 'immunology'
            | 'pathology'
            | 'pharmacology'
            | 'biostatistics'
            | 'public_health'
            | 'internal_medicine'
            | 'surgery'
            | 'pediatrics'
            | 'obstetrics_gynecology'
            | 'psychiatry'
            | 'neurology'
            | 'radiology'
            | 'orthopedics'
            | 'ophthalmology'
            | 'ent'
            | 'dermatology'
            | 'cardiology'
            | 'urology'
            | 'other'
            | null
          stem: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e: string | null
          correct_answer: 'A' | 'B' | 'C' | 'D' | 'E'
          created_at: string
        }
        Insert: {
          question: number
          question_text: string
          id?: string
          section: 'basic_sciences' | 'clinical_sciences'
          topic: string
          subtopic?:
            | 'anatomy'
            | 'histology'
            | 'embryology'
            | 'physiology'
            | 'biochemistry'
            | 'microbiology'
            | 'immunology'
            | 'pathology'
            | 'pharmacology'
            | 'biostatistics'
            | 'public_health'
            | 'internal_medicine'
            | 'surgery'
            | 'pediatrics'
            | 'obstetrics_gynecology'
            | 'psychiatry'
            | 'neurology'
            | 'radiology'
            | 'orthopedics'
            | 'ophthalmology'
            | 'ent'
            | 'dermatology'
            | 'cardiology'
            | 'urology'
            | 'other'
            | null
          stem: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e?: string | null
          correct_answer: 'A' | 'B' | 'C' | 'D' | 'E'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['questions']['Insert']>
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          score: number
          max_streak: number
          timer_enabled: boolean
          section_filter: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          score?: number
          max_streak?: number
          timer_enabled?: boolean
          section_filter?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      attempts: {
        Row: {
          id: string
          user_id: string
          session_id: string
          question_id: number
          user_answer: string | null
          is_correct: boolean
          time_taken_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          question_id: number
          user_answer?: string | null
          is_correct?: boolean
          time_taken_ms?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['attempts']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'attempts_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempts_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      bookmarks: {
        Row: {
          id: string
          user_id: string
          question_id: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          question_id: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookmarks']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'bookmarks_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bookmarks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
