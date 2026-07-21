"use client"

import { useId, useState, useTransition } from "react"
import { Swords } from "lucide-react"

import { SelectNative } from "@/components/ui/select-native"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import { carregarConfrontoDireto } from "@/actions/insights"
import type { ConfrontoDireto } from "@/features/standings/insights"
import type { RivalCompetidor } from "@/features/league/data/getRivaisDoCompetidor"

/**
 * Painel de confronto direto histórico (change add-insights-classificacao). O
 * picker de rival é a ÚNICA folha interativa da página do competidor. Ao escolher,
 * chama a server action de LEITURA `carregarConfrontoDireto` SOB DEMANDA (POST) —
 * NUNCA um `<Link>` prefetchável nem navegação que re-execute a rota RSC cara
 * (classe do incidente 503). `A` é o competidor da página; `B` é o rival escolhido.
 */
export function ConfrontoDiretoPanel({
  competitorId,
  competitorNome,
  competitorEscudoUrl,
  rivais,
}: {
  competitorId: string
  competitorNome: string
  competitorEscudoUrl: string | null
  rivais: RivalCompetidor[]
}) {
  const selectId = useId()
  const [rivalId, setRivalId] = useState<string>("")
  const [confronto, setConfronto] = useState<ConfrontoDireto | null>(null)
  const [pendente, startTransition] = useTransition()

  const rival = rivais.find((r) => r.id === rivalId) ?? null

  function aoTrocar(novoId: string) {
    setRivalId(novoId)
    setConfronto(null)
    if (!novoId) return
    startTransition(async () => {
      const dados = await carregarConfrontoDireto(competitorId, novoId)
      setConfronto(dados)
    })
  }

  if (rivais.length === 0) return null

  return (
    <section aria-labelledby="confronto-titulo" className="flex flex-col gap-3">
      <h2
        id="confronto-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Swords className="size-5 text-gold-ink" aria-hidden="true" />
        Confronto direto
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-muted-foreground text-sm">
          Escolha um rival para ver o histórico
        </label>
        <SelectNative
          id={selectId}
          value={rivalId}
          onChange={(e) => aoTrocar(e.target.value)}
          className="md:h-10"
        >
          <option value="">Selecione um competidor…</option>
          {rivais.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </SelectNative>
      </div>

      {pendente ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Carregando confronto…
        </p>
      ) : rival && confronto ? (
        <ConfrontoResultado
          confronto={confronto}
          aNome={competitorNome}
          aEscudo={competitorEscudoUrl}
          bNome={rival.nome}
          bEscudo={rival.escudoUrl}
        />
      ) : null}
    </section>
  )
}

function ConfrontoResultado({
  confronto,
  aNome,
  aEscudo,
  bNome,
  bEscudo,
}: {
  confronto: ConfrontoDireto
  aNome: string
  aEscudo: string | null
  bNome: string
  bEscudo: string | null
}) {
  if (confronto.jogos.length === 0) {
    return (
      <div className="bg-muted/10 rounded-xl border border-dashed px-4 py-8 text-center">
        <p className="text-muted-foreground text-sm">
          Sem histórico entre {aNome} e {bNome} ainda.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Agregado */}
      <div className="elevate flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <ConfrontoLado nome={aNome} escudo={aEscudo} valor={confronto.aVitorias} legenda="vitórias" />
        <div className="flex flex-col items-center">
          <span className="font-display text-sm font-bold tabular-nums">
            {confronto.empates}
          </span>
          <span className="text-muted-foreground text-[0.7rem]">empates</span>
          {confronto.duploWo > 0 ? (
            <span className="text-muted-foreground mt-0.5 text-[0.65rem]">
              {confronto.duploWo} W.O. duplo
            </span>
          ) : null}
        </div>
        <ConfrontoLado nome={bNome} escudo={bEscudo} valor={confronto.bVitorias} legenda="vitórias" alinhar="right" />
      </div>

      {/* Gols no confronto */}
      <p className="text-muted-foreground text-center text-xs">
        Gols no confronto: {confronto.aGolsPro} — {confronto.aGolsContra}
      </p>

      {/* Lista de jogos */}
      <ol className="flex list-none flex-col gap-1.5 p-0">
        {confronto.jogos.map((j) => {
          const rotulo = j.woDuplo
            ? "W.O. duplo"
            : j.resultadoA === "V"
              ? `Vitória de ${aNome}`
              : j.resultadoA === "D"
                ? `Vitória de ${bNome}`
                : "Empate"
          return (
            <li
              key={j.matchId}
              className="flex items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground min-w-0 truncate text-xs">
                {j.rodada != null ? `Rodada ${j.rodada}` : "Amistoso"}
              </span>
              <span className="font-display font-bold tabular-nums">
                {j.woDuplo || j.wo ? "W.O." : `${j.placarA} x ${j.placarB}`}
              </span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">
                {rotulo}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ConfrontoLado({
  nome,
  escudo,
  valor,
  legenda,
  alinhar = "left",
}: {
  nome: string
  escudo: string | null
  valor: number
  legenda: string
  alinhar?: "left" | "right"
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        alinhar === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <TeamCrest nome={nome} escudoUrl={escudo} size={28} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{nome}</span>
        <span className="font-display text-base font-bold tabular-nums">
          {valor}{" "}
          <span className="text-muted-foreground text-[0.7rem] font-normal">
            {legenda}
          </span>
        </span>
      </div>
    </div>
  )
}
