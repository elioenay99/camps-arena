// Tipos do banco mantidos à mão, espelhando supabase/schema.sql.
// Fonte de verdade do schema é o SQL; estes tipos dão type-safety ao client.

export type TournamentStatus = "rascunho" | "ativo" | "encerrado"
export type MatchStatus = "agendada" | "em_andamento" | "encerrada"

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          nome: string | null
          celular: string | null
          avatar: string | null
          created_at: string
        }
        Insert: {
          id: string
          nome?: string | null
          celular?: string | null
          avatar?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string | null
          celular?: string | null
          avatar?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          id: string
          titulo: string
          status: TournamentStatus
          created_by: string | null
          is_public: boolean
          pontos_vitoria: number
          pontos_empate: number
          pontos_derrota: number
          created_at: string
        }
        Insert: {
          id?: string
          titulo: string
          status?: TournamentStatus
          created_by?: string | null
          is_public?: boolean
          pontos_vitoria?: number
          pontos_empate?: number
          pontos_derrota?: number
          created_at?: string
        }
        Update: {
          id?: string
          titulo?: string
          status?: TournamentStatus
          created_by?: string | null
          is_public?: boolean
          pontos_vitoria?: number
          pontos_empate?: number
          pontos_derrota?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          id: string
          nome: string
          escudo_url: string | null
          external_id: string | null
          provider: string
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          escudo_url?: string | null
          external_id?: string | null
          provider?: string
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          escudo_url?: string | null
          external_id?: string | null
          provider?: string
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          tournament_id: string
          participante_1: string | null
          participante_2: string | null
          time_1: string | null
          time_2: string | null
          placar_1: number
          placar_2: number
          status: MatchStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          participante_1?: string | null
          participante_2?: string | null
          time_1?: string | null
          time_2?: string | null
          placar_1?: number
          placar_2?: number
          status?: MatchStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          participante_1?: string | null
          participante_2?: string | null
          time_1?: string | null
          time_2?: string | null
          placar_1?: number
          placar_2?: number
          status?: MatchStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participante_1_fkey"
            columns: ["participante_1"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participante_2_fkey"
            columns: ["participante_2"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_time_1_fkey"
            columns: ["time_1"]
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_time_2_fkey"
            columns: ["time_2"]
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      users_public: {
        Row: {
          id: string
          nome: string | null
          avatar: string | null
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: {
      tournament_status: TournamentStatus
      match_status: MatchStatus
    }
    CompositeTypes: Record<string, never>
  }
}
