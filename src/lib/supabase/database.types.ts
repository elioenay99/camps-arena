// Tipos do banco mantidos à mão, espelhando supabase/schema.sql.
// Fonte de verdade do schema é o SQL; estes tipos dão type-safety ao client.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type TournamentStatus = "rascunho" | "ativo" | "encerrado"
export type TournamentFormat =
  | "avulso"
  | "liga"
  | "mata_mata"
  | "grupos_mata_mata"
  | "fase_liga"
export type MatchStatus = "agendada" | "em_andamento" | "encerrada"
export type WoRequestStatus = "pendente" | "aceito" | "recusado"
export type LeagueCompetitionStatus = "ativa" | "arquivada"
export type LeagueSeasonStatus =
  | "rascunho"
  | "ativa"
  | "em_fluxo"
  | "encerrada"
export type LeagueRankingBase = "posicao" | "ppg" | "promedios"
export type LeagueBoundaryMode =
  | "direto"
  | "playoff_acesso"
  | "playout"
  | "barragem_cruzada"

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
          desempate_criterio: string
          cor_primaria: string | null
          cor_secundaria: string | null
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
          desempate_criterio?: string
          cor_primaria?: string | null
          cor_secundaria?: string | null
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
          desempate_criterio?: string
          cor_primaria?: string | null
          cor_secundaria?: string | null
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
          liberada_em: string | null
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
          liberada_em?: string | null
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
          liberada_em?: string | null
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
          status: WoRequestStatus
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          match_id: string
          solicitante_slot: string
          motivo?: string | null
          status?: WoRequestStatus
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          solicitante_slot?: string
          motivo?: string | null
          status?: WoRequestStatus
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
      push_subscriptions: {
        Row: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
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
          competitor_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          team_id?: string | null
          rotulo?: string | null
          user_id?: string | null
          competitor_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          team_id?: string | null
          rotulo?: string | null
          user_id?: string | null
          competitor_id?: string | null
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
          {
            foreignKeyName: "tournament_slots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "league_competitors"
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
      league_competitions: {
        Row: {
          id: string
          nome: string
          created_by: string | null
          status: LeagueCompetitionStatus
          desempate_padrao: string
          is_public: boolean
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          created_by?: string | null
          status?: LeagueCompetitionStatus
          desempate_padrao?: string
          is_public?: boolean
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          created_by?: string | null
          status?: LeagueCompetitionStatus
          desempate_padrao?: string
          is_public?: boolean
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          id: string
          competition_id: string
          numero: number
          status: LeagueSeasonStatus
          ciclo: string
          config_snapshot: Json
          previous_season_id: string | null
          created_at: string
          encerrada_em: string | null
        }
        Insert: {
          id?: string
          competition_id: string
          numero: number
          status?: LeagueSeasonStatus
          ciclo?: string
          config_snapshot?: Json
          previous_season_id?: string | null
          created_at?: string
          encerrada_em?: string | null
        }
        Update: {
          id?: string
          competition_id?: string
          numero?: number
          status?: LeagueSeasonStatus
          ciclo?: string
          config_snapshot?: Json
          previous_season_id?: string | null
          created_at?: string
          encerrada_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_previous_season_id_fkey"
            columns: ["previous_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_division_seasons: {
        Row: {
          id: string
          season_id: string
          nivel: number
          nome: string
          tournament_id: string | null
          tournament_id_clausura: string | null
          final_tournament_id: string | null
          por_nome: boolean
          desempate: string
          ranking_base: LeagueRankingBase
          formato: string
          qtd_grupos: number | null
          classificados_por_grupo: number | null
          tamanho: number
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          nivel: number
          nome: string
          tournament_id?: string | null
          tournament_id_clausura?: string | null
          final_tournament_id?: string | null
          por_nome?: boolean
          desempate?: string
          ranking_base?: LeagueRankingBase
          formato?: string
          qtd_grupos?: number | null
          classificados_por_grupo?: number | null
          tamanho: number
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          nivel?: number
          nome?: string
          tournament_id?: string | null
          tournament_id_clausura?: string | null
          final_tournament_id?: string | null
          por_nome?: boolean
          desempate?: string
          ranking_base?: LeagueRankingBase
          formato?: string
          qtd_grupos?: number | null
          classificados_por_grupo?: number | null
          tamanho?: number
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_division_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_division_seasons_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_division_seasons_tournament_id_clausura_fkey"
            columns: ["tournament_id_clausura"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_division_seasons_final_tournament_id_fkey"
            columns: ["final_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      league_boundaries: {
        Row: {
          id: string
          season_id: string
          nivel_superior: number
          vagas_rebaixamento: number
          vagas_acesso: number
          modo: LeagueBoundaryMode
          playoff_vagas: number | null
          playoff_estilo: string | null
          playoff_ida_e_volta: boolean
          playoff_tournament_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          nivel_superior: number
          vagas_rebaixamento?: number
          vagas_acesso?: number
          modo?: LeagueBoundaryMode
          playoff_vagas?: number | null
          playoff_estilo?: string | null
          playoff_ida_e_volta?: boolean
          playoff_tournament_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          nivel_superior?: number
          vagas_rebaixamento?: number
          vagas_acesso?: number
          modo?: LeagueBoundaryMode
          playoff_vagas?: number | null
          playoff_estilo?: string | null
          playoff_ida_e_volta?: boolean
          playoff_tournament_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_boundaries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_boundaries_playoff_tournament_id_fkey"
            columns: ["playoff_tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      league_competitors: {
        Row: {
          id: string
          competition_id: string
          team_id: string | null
          rotulo: string | null
          holder_user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          competition_id: string
          team_id?: string | null
          rotulo?: string | null
          holder_user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          competition_id?: string
          team_id?: string | null
          rotulo?: string | null
          holder_user_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_competitors_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_competitors_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_competitors_holder_user_id_fkey"
            columns: ["holder_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      league_division_entries: {
        Row: {
          id: string
          division_season_id: string
          competitor_id: string
          slot_id: string | null
          posicao_final: number | null
          destino: string | null
          resolvido_por: string | null
          pontos: number | null
          jogos: number | null
          created_at: string
        }
        Insert: {
          id?: string
          division_season_id: string
          competitor_id: string
          slot_id?: string | null
          posicao_final?: number | null
          destino?: string | null
          resolvido_por?: string | null
          pontos?: number | null
          jogos?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          division_season_id?: string
          competitor_id?: string
          slot_id?: string | null
          posicao_final?: number | null
          destino?: string | null
          resolvido_por?: string | null
          pontos?: number | null
          jogos?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_division_entries_division_season_id_fkey"
            columns: ["division_season_id"]
            isOneToOne: false
            referencedRelation: "league_division_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_division_entries_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "league_competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_division_entries_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "tournament_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_members: {
        Row: {
          tournament_id: string
          user_id: string
          papel: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          tournament_id: string
          user_id: string
          papel: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          tournament_id?: string
          user_id?: string
          papel?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          competition_id: string
          user_id: string
          papel: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          competition_id: string
          user_id: string
          papel: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          competition_id?: string
          user_id?: string
          papel?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          id: string
          escopo: string
          tournament_id: string | null
          competition_id: string | null
          papel: string
          code: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          escopo: string
          tournament_id?: string | null
          competition_id?: string | null
          papel: string
          code: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          escopo?: string
          tournament_id?: string | null
          competition_id?: string | null
          papel?: string
          code?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      celulares_de_contato: {
        Args: { p_user_ids: string[] }
        Returns: { user_id: string; celular: string | null }[]
      }
      subscriptions_de: {
        Args: { p_user_ids: string[] }
        Returns: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
        }[]
      }
      remover_push_endpoint: {
        Args: { p_endpoint: string }
        Returns: undefined
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
      eh_dono_competition: {
        Args: { c_id: string }
        Returns: boolean
      }
      montar_temporada: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      montar_playoff: {
        Args: { p_boundary_id: string; p_competitor_ids: string[] }
        Returns: string
      }
      montar_barragem: {
        Args: { p_boundary_id: string; p_competitor_ids: string[] }
        Returns: string
      }
      montar_grande_final: {
        Args: { p_division_season_id: string; p_competitor_ids: string[] }
        Returns: string
      }
      liga_do_torneio: {
        Args: { p_tid: string }
        Returns: string
      }
      pode_gerir_torneio: {
        Args: { p_tid: string }
        Returns: boolean
      }
      pode_arbitrar_torneio: {
        Args: { p_tid: string }
        Returns: boolean
      }
      pode_moderar_torneio: {
        Args: { p_tid: string }
        Returns: boolean
      }
      pode_ver_bastidores_torneio: {
        Args: { p_tid: string }
        Returns: boolean
      }
      pode_gerir_competition: {
        Args: { p_cid: string }
        Returns: boolean
      }
      pode_arbitrar_competition: {
        Args: { p_cid: string }
        Returns: boolean
      }
      pode_moderar_competition: {
        Args: { p_cid: string }
        Returns: boolean
      }
      pode_ver_bastidores_competition: {
        Args: { p_cid: string }
        Returns: boolean
      }
      info_convite_membro: {
        Args: { p_code: string }
        Returns: {
          escopo: string
          alvo_id: string
          titulo: string
          papel: string
          ja_membro: boolean
        }[]
      }
      aceitar_convite_membro: {
        Args: { p_code: string }
        Returns: {
          escopo: string
          alvo_id: string
        }[]
      }
      subscriptions_para_nomeacao: {
        Args: { p_user_id: string; p_escopo: string; p_id: string }
        Returns: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
        }[]
      }
    }
    Enums: {
      tournament_status: TournamentStatus
      tournament_format: TournamentFormat
      match_status: MatchStatus
      league_competition_status: LeagueCompetitionStatus
      league_season_status: LeagueSeasonStatus
      league_ranking_base: LeagueRankingBase
      league_boundary_mode: LeagueBoundaryMode
    }
    CompositeTypes: Record<string, never>
  }
}
