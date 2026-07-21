"use client"

import { useId, useState, useTransition } from "react"
import { Swords } from "lucide-react"

import { SelectNative } from "@/components/ui/select-native"

import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { carregarConfrontoTecnicos } from "@/actions/insights"
import type { ConfrontoDireto } from "@/features/standings/insights"
import type { AdversarioTecnico } from "@/features/league/data/getTecnicoCampanha"

/**
 * Confronto direto entre DOIS técnicos (change add-perfil-tecnico-carreira),
 * espelhando `ConfrontoDiretoPanel`. O picker de adversário é a única folha
 * interativa; ao escolher, chama a server action de LEITURA
 * `carregarConfrontoTecnicos` SOB DEMANDA (POST) — nunca um `<Link>` prefetchável.
 * `A` é o técnico da página; `B` é o adversário escolhido. O seletor só lista
 * adversários COM conta que ele já enfrentou.
 */
export function ConfrontoTecnicosPanel({
  userId,
  nome,
  avatar,
  adversarios,
}: {
  userId: string
  nome: string
  avatar: string | null
  adversarios: AdversarioTecnico[]
}) {
  const selectId = useId()
  const [adversarioId, setAdversarioId] = useState<string>("")
  const [confronto, setConfronto] = useState<ConfrontoDireto | null>(null)
  const [pendente, startTransition] = useTransition()

  const adversario = adversarios.find((a) => a.userId === adversarioId) ?? null

  function aoTrocar(novoId: string) {
    setAdversarioId(novoId)
    setConfronto(null)
    if (!novoId) return
    startTransition(async () => {
      const dados = await carregarConfrontoTecnicos(userId, novoId)
      setConfronto(dados)
    })
  }

  if (adversarios.length === 0) return null

  return (
    <section aria-labelledby="confronto-tecnicos-titulo" className="flex flex-col gap-3">
      <h2
        id="confronto-tecnicos-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Swords className="size-5 text-gold-ink" aria-hidden="true" />
        Confronto entre técnicos
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-muted-foreground text-sm">
          Escolha um adversário para ver o histórico
        </label>
        <SelectNative
          id={selectId}
          value={adversarioId}
          onChange={(e) => aoTrocar(e.target.value)}
          className="md:h-10"
        >
          <option value="">Selecione um técnico…</option>
          {adversarios.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.nome} ({a.jogos} {a.jogos === 1 ? "jogo" : "jogos"})
            </option>
          ))}
        </SelectNative>
      </div>

      {pendente ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Carregando confronto…
        </p>
      ) : adversario && confronto ? (
        <ConfrontoResultado
          confronto={confronto}
          aNome={nome}
          aAvatar={avatar}
          bNome={adversario.nome}
          bAvatar={adversario.avatar}
        />
      ) : null}
    </section>
  )
}

function ConfrontoResultado({
  confronto,
  aNome,
  aAvatar,
  bNome,
  bAvatar,
}: {
  confronto: ConfrontoDireto
  aNome: string
  aAvatar: string | null
  bNome: string
  bAvatar: string | null
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
        <ConfrontoLado nome={aNome} avatar={aAvatar} valor={confronto.aVitorias} legenda="vitórias" />
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
        <ConfrontoLado nome={bNome} avatar={bAvatar} valor={confronto.bVitorias} legenda="vitórias" alinhar="right" />
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
  avatar,
  valor,
  legenda,
  alinhar = "left",
}: {
  nome: string
  avatar: string | null
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
      <UserAvatar nome={nome} avatarUrl={avatar} size={28} />
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
