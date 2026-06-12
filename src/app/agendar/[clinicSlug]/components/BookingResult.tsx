import { Button } from "@/shared/components/ui"

/**
 * Terminal screens for the wizard: success (confirmed / pending) and the 409
 * "slot just taken" case which offers a retry back to the slot picker.
 */
export function BookingResult({
  kind,
  onPickAnother,
}: {
  kind: "confirmed" | "pending" | "conflict"
  onPickAnother: () => void
}) {
  if (kind === "conflict") {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-warn-50 flex items-center justify-center">
          <span className="text-warn-700 text-xl">!</span>
        </div>
        <p className="text-foreground font-medium mb-4">
          Ops! Esse horário acabou de ser preenchido. Escolha outro horário.
        </p>
        <Button onClick={onPickAnother}>Ver outros horários</Button>
      </div>
    )
  }

  const confirmed = kind === "confirmed"
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-ok-50 flex items-center justify-center">
        <span className="text-ok-700 text-xl">✓</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        {confirmed ? "Agendamento confirmado!" : "Solicitação enviada!"}
      </h2>
      <p className="text-muted-foreground">
        {confirmed
          ? "Você receberá uma mensagem com os detalhes."
          : "A clínica vai confirmar seu horário em breve."}
      </p>
    </div>
  )
}
