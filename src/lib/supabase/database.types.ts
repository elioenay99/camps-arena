// Tipos do banco mantidos à mão, espelhando supabase/schema.sql.
// Fonte de verdade do schema é o SQL; estes tipos dão type-safety ao client.

export type TournamentStatus = "rascunho" | "ativo" | "encerrado"
export type TournamentFormat =
  | "avulso"
  | "liga"
  | "mata_mata"
  | "grupos_mata_mata"
  | "fase_liga"
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
          formato: TournamentFormat
          ida_e_volta: boolean
          terceiro_lugar: boolean
          por_nome: boolean
          classificados_por_grupo: number | null
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
          formato?: TournamentFormat
          ida_e_volta?: boolean
          terceiro_lugar?: boolean
          por_nome?: boolean
          classificados_por_grupo?: number | null
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
          formato?: TournamentFormat
          ida_e_volta?: boolean
          terceiro_lugar?: boolean
          por_nome?: boolean
          classificados_por_grupo?: number | null
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
          vaga_1: string | null
          vaga_2: string | null
          time_1: string | null
          time_2: string | null
          placar_1: number
          placar_2: number
          status: MatchStatus
          rodada: number | null
          posicao: number | null
          perna: number | null
          grupo: number | null
          wo: boolean
          wo_vencedor: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          participante_1?: string | null
          participante_2?: string | null
          vaga_1?: string | null
          vaga_2?: string | null
          time_1?: string | null
          time_2?: string | null
          placar_1?: number
          placar_2?: number
          status?: MatchStatus
          rodada?: number | null
          posicao?: number | null
          perna?: number | null
          grupo?: number | null
          wo?: boolean
          wo_vencedor?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          participante_1?: string | null
          participante_2?: string | null
          vaga_1?: string | null
          vaga_2?: string | null
          time_1?: string | null
          time_2?: string | null
          placar_1?: number
          placar_2?: number
          status?: MatchStatus
          rodada?: number | null
          posicao?: number | null
          perna?: number | null
          grupo?: number | null
          wo?: boolean
          wo_vencedor?: string | null
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
          {
            foreignKeyName: "matches_vaga_1_fkey"
            columns: ["vaga_1"]
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_vaga_2_fkey"
            columns: ["vaga_2"]
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_wo_vencedor_fkey"
            columns: ["wo_vencedor"]
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      match_wo_requests: {
        Row: {
          id: string
          match_id: string
          solicitante_slot: string
          motivo: string | null
          status: string
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          match_id: string
          solicitante_slot: string
          motivo?: string | null
          status?: string
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          solicitante_slot?: string
          motivo?: string | null
          status?: string
          created_at?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_wo_requests_match_id_fkey"
            columns: ["match_id"]
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_wo_requests_solicitante_slot_fkey"
            columns: ["solicitante_slot"]
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          tournament_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          tournament_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          tournament_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_tournament_id_fkey"
            columns: ["tournament_id"]
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_slots: {
        Row: {
          id: string
          tournament_id: string
          team_id: string | null
          rotulo: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          team_id?: string | null
          rotulo?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          team_id?: string | null
          rotulo?: string | null
          user_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_slots_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_invites: {
        Row: {
          slot_id: string
          code: string
          created_at: string
        }
        Insert: {
          slot_id: string
          code: string
          created_at?: string
        }
        Update: {
          slot_id?: string
          code?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_invites_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: true
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_invites: {
        Row: {
          tournament_id: string
          code: string
          created_at: string
        }
        Insert: {
          tournament_id: string
          code: string
          created_at?: string
        }
        Update: {
          tournament_id?: string
          code?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_invites_tournament_id_fkey"
            columns: ["tournament_id"]
            referencedRelation: "tournaments"
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
    Functions: {
      eh_participante: {
        Args: { t_id: string }
        Returns: boolean
      }
      aceitar_convite: {
        Args: { codigo: string }
        Returns: string
      }
      info_convite: {
        Args: { codigo: string }
        Returns: {
          tournament_id: string
          titulo: string
          status: TournamentStatus
          formato: TournamentFormat
          ja_participa: boolean
        }[]
      }
      aceitar_convite_vaga: {
        Args: { codigo: string }
        Returns: string
      }
      info_convite_vaga: {
        Args: { codigo: string }
        Returns: {
          tournament_id: string
          titulo: string
          status: TournamentStatus
          clube: string
          escudo_url: string | null
          vaga_ocupada: boolean
          ja_tem_vaga: boolean
        }[]
      }
    }
    Enums: {
      tournament_status: TournamentStatus
      tournament_format: TournamentFormat
      match_status: MatchStatus
    }
    CompositeTypes: Record<string, never>
  }
}
