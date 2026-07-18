"use client"

import Link from "next/link"
import { Crown } from "lucide-react"

import { BracketView } from "@/features/knockout/components/BracketView"
import { StatusPill } from "@/features/tournament/components/StatusPill"
import { useDemoStore, useTorneio } from "@/features/demo/store/useDemoStore"
import type { TorneioDemo } from "@/features/demo/store/tipos"

import { ReadOnlyBanner } from "./ReadOnlyBanner"

/** Classificação final derivada da chave (campeão/vice/3º) — puro sobre os dados. */
function classificacaoFinal(torneio: TorneioDemo): { rotulo: string; nome: string }[] {
  const chave = torneio.chave
  if (chave.length === 0) return []
  const rodadaFinal = Math.max(...chave.map((c) => c.rodada))
  const final = chave.find((c) => c.rodada === rodadaFinal && c.posicao === 1)
  const terceiro = chave.find((c) => c.rodada === rodadaFinal && c.posicao === 2)
  const out: { rotulo: string; nome: string }[] = []
  if (final && final.status === "encerrada") {
    const campeaoNome = final.placar_1 >= final.placar_2 ? final.nome_1 : final.nome_2
    const viceNome = final.placar_1 >= final.placar_2 ? final.nome_2 : final.nome_1
    out.push({ rotulo: "Campeão", nome: campeaoNome })
    out.push({ rotulo: "Vice", nome: viceNome })
  }
  if (terceiro && terceiro.status === "encerrada") {
    const terceiroNome =
      terceiro.placar_1 >= terceiro.placar_2 ? terceiro.nome_1 : terceiro.nome_2
    out.push({ rotulo: "3º lugar", nome: terceiroNome })
  }
  return out
}

export function DemoCopaView({ id }: { id: string }) {
  const torneio = useTorneio(id)
  const { state } = useDemoStore()
  const flags = { podeGerir: state.perfil === "gestor" || state.perfil === "admin" }

  if (!torneio || torneio.chave.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        Copa não encontrada nesta demonstração.{" "}
        <Link href="/demo/copas" className="text-primary hover:underline">
          Ver copas
        </Link>
      </div>
    )
  }

  const podio = classificacaoFinal(torneio)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">{torneio.nome}</h1>
        <StatusPill status={torneio.status} />
      </div>

      {podio.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {podio.map((p, i) => (
            <div
              key={p.rotulo}
              className="flex flex-col items-center gap-1 rounded-xl border bg-card/60 px-2 py-3 text-center"
            >
              {i === 0 ? (
                <Crown aria-hidden className="size-5 text-gold" />
              ) : null}
              <span className="text-sm font-semibold">{p.nome}</span>
              <span className="text-xs text-muted-foreground">{p.rotulo}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section aria-label="Chave da copa" className="overflow-x-auto">
        <BracketView
          partidas={torneio.chave}
          terceiroLugar={torneio.terceiroLugar}
          cor={torneio.corPrimaria}
          celebrarCampeao
        />
      </section>

      {flags.podeGerir ? (
        <ReadOnlyBanner titulo="Gestão da copa">
          Definir regras de classificação, montar a edição e avançar fases ficam
          disponíveis para gestores no Goliseu real.
        </ReadOnlyBanner>
      ) : null}
    </div>
  )
}
