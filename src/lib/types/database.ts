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
          topic: string | null
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
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e: string | null
          correct_answer: 'A' | 'B' | 'C' | 'D' | 'E'
          is_incomplete: boolean | null
          source_page_hint: string | null
          source_file: string | null
          source_file_id: string | null
          join_key: string
        }
        Insert: {
          question: number
          question_text: string
          topic?: string | null
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
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e?: string | null
          correct_answer: 'A' | 'B' | 'C' | 'D' | 'E'
          is_incomplete?: boolean | null
          source_page_hint?: string | null
          source_file?: string | null
          source_file_id?: string | null
          join_key: string
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
          question_id: number | null
          join_key: string
          user_answer: string | null
          is_correct: boolean
          time_taken_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          question_id?: number | null
          join_key: string
          user_answer?: string | null
          is_correct?: boolean
          time_taken_ms?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['attempts']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'attempts_join_key_fkey'
            columns: ['join_key']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['join_key']
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
          question_id: number | null
          join_key: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          question_id?: number | null
          join_key: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookmarks']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'bookmarks_join_key_fkey'
            columns: ['join_key']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['join_key']
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
