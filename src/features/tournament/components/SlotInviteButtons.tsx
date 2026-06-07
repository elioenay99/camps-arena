"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import {
  assumirVagaComoDono,
  desistirDaVaga,
  expulsarTecnico,
  regenerarConviteVaga,
  type SlotActionResult,
} from "@/actions/slots"
import { Button } from "@/components/ui/button"

/**
 * Folhas client mínimas (padrão ParticipantButtons): action + toast; o
 * revalidatePath das actions atualiza a página — sem estado local além do
 * pending. Os botões são UX; a autorização real é action + RLS.
 */
function ActionButton({
  rotulo,
  pendente,
  sucesso,
  variant = "outline",
  executar,
}: {
  rotulo: string
  pendente: string
  sucesso: string
  variant?: "default" | "outline" | "destructive"
  executar: () => Promise<SlotActionResult>
}) {
  const [emAndamento, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={emAndamento}
      onClick={() =>
        startTransition(async () => {
          const r = await executar()
          if (r.ok) toast.success(sucesso)
          else toast.error(r.error)
        })
      }
    >
      {emAndamento ? pendente : rotulo}
    </Button>
  )
}

/**
 * Copiar o link de convite da VAGA. `navigator.clipboard` exige contexto
 * seguro (https/localhost) — fora dele o fallback é o usuário copiar o texto
 * exibido. O `code` é segredo do dono: só renderizado para ele (gate na page).
 */
export function CopyVagaLinkButton({ url }: { url: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          toast.success("Link do convite copiado.")
        } catch {
          toast.error(
            "Não foi possível copiar. Selecione e copie o link manualmente."
          )
        }
      }}
    >
      Copiar link
    </Button>
  )
}

/** Gera (ou regenera) o convite da vaga — o link antigo deixa de valer. */
export function RegenerarConviteVagaButton({
  slotId,
  temConvite,
}: {
  slotId: string
  temConvite: boolean
}) {
  return (
    <ActionButton
      rotulo={temConvite ? "Gerar novo link" : "Gerar link"}
      pendente="Gerando…"
      sucesso={
        temConvite
          ? "Novo link gerado. O anterior deixou de valer."
          : "Link do convite gerado."
      }
      variant={temConvite ? "outline" : "default"}
      executar={() => regenerarConviteVaga(slotId)}
    />
  )
}

/** O DONO expulsa o técnico (a vaga fica vazia; as partidas não mudam). */
export function ExpulsarTecnicoButton({ slotId }: { slotId: string }) {
  return (
    <ActionButton
      rotulo="Expulsar técnico"
      pendente="Expulsando…"
      sucesso="Técnico removido da vaga."
      variant="destructive"
      executar={() => expulsarTecnico(slotId)}
    />
  )
}

/** O DONO assume para SI uma vaga vazia (via o convite da própria vaga). */
export function AssumirVagaButton({ slotId }: { slotId: string }) {
  return (
    <ActionButton
      rotulo="Assumir o clube"
      pendente="Assumindo…"
      sucesso="Você assumiu o clube."
      variant="default"
      executar={() => assumirVagaComoDono(slotId)}
    />
  )
}

/** O TÉCNICO desiste do clube (esvazia a própria vaga). */
export function DesistirDaVagaButton({ tournamentId }: { tournamentId: string }) {
  return (
    <ActionButton
      rotulo="Desistir do clube"
      pendente="Saindo…"
      sucesso="Você desistiu do clube."
      executar={() => desistirDaVaga(tournamentId)}
    />
  )
}
