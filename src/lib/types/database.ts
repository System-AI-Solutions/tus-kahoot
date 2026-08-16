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
          question_number: number
          question_text: string | null
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
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          option_e: string | null
          correct_answer: 'A' | 'B' | 'C' | 'D' | 'E' | null
          is_incomplete: boolean | null
          source_page_hint: number | null
          source_file: string | null
          source_file_id: string | null
          join_key: string
          timestamp: string
          answer_parse_status: string | null
        }
        Insert: {
          question_number: number
          question_text?: string | null
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
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          option_e?: string | null
          correct_answer?: 'A' | 'B' | 'C' | 'D' | 'E' | null
          is_incomplete?: boolean | null
          source_page_hint?: number | null
          source_file?: string | null
          source_file_id?: string | null
          join_key: string
          timestamp?: string
          answer_parse_status?: string | null
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
          question_number: number
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
          question_number: number
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
      question_explanations: {
        Row: {
          join_key: string
          explanation: string | null
          option_a_explanation: string | null
          option_b_explanation: string | null
          option_c_explanation: string | null
          option_d_explanation: string | null
          option_e_explanation: string | null
          attending_tip: string | null
          key_info: string | null
          image_url: string | null
          source_note: string | null
          updated_at: string
        }
        Insert: {
          join_key: string
          explanation?: string | null
          option_a_explanation?: string | null
          option_b_explanation?: string | null
          option_c_explanation?: string | null
          option_d_explanation?: string | null
          option_e_explanation?: string | null
          attending_tip?: string | null
          key_info?: string | null
          image_url?: string | null
          source_note?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['question_explanations']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'question_explanations_join_key_fkey'
            columns: ['join_key']
            isOneToOne: true
            referencedRelation: 'questions'
            referencedColumns: ['join_key']
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
