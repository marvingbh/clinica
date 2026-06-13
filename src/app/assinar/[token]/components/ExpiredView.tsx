"use client"

import { useState } from "react"
import { Clock } from "lucide-react"

interface Props {
  state: "expired" | "invalidated" | "cancelled" | "invalid"
  onRequestRenewal: () => void
}

const MESSAGES: Record<Props["state"], string> = {
  expired: "Este link expirou. Solicite um novo link à clínica.",
  invalidated: "Este documento foi atualizado pela clínica. Você receberá um novo link em breve.",
  cancelled: "Este envio foi cancelado pela clínica.",
  invalid: "Link inválido.",
}

export function ExpiredView({ state, onRequestRenewal }: Props) {
  const [requested, setRequested] = useState(false)
  return (
    <div className="text-center space-y-4 py-8">
      <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">{MESSAGES[state]}</p>
      {state === "expired" && (
        requested ? (
          <p className="text-sm text-green-700">Pedido enviado! A clínica entrará em contato.</p>
        ) : (
          <button type="button" onClick={() => { setRequested(true); onRequestRenewal() }} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
            Solicitar novo link
          </button>
        )
      )}
    </div>
  )
}
