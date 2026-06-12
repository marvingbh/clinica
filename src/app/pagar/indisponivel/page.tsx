import { Suspense } from "react"
import { AlertCircleIcon, CheckCircleIcon } from "@/shared/components/ui/icons"

const MESSAGES: Record<string, { title: string; body: string; paid?: boolean }> = {
  expirado: {
    title: "Link de pagamento expirado",
    body: "Este link de pagamento expirou. Entre em contato com a clínica para receber um novo link.",
  },
  pago: {
    title: "Fatura já paga",
    body: "Esta fatura já foi paga. Obrigado!",
    paid: true,
  },
  invalido: {
    title: "Link indisponível",
    body: "Este link de pagamento não está mais disponível. Entre em contato com a clínica.",
  },
}

function Content({ motivo }: { motivo: string }) {
  const msg = MESSAGES[motivo] ?? MESSAGES.invalido
  const Icon = msg.paid ? CheckCircleIcon : AlertCircleIcon
  const accent = msg.paid ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${accent}`}>
          <Icon className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{msg.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{msg.body}</p>
      </div>
    </main>
  )
}

/** Public page shown when a payment link cannot be used (expired/paid/invalid). */
export default async function PagamentoIndisponivelPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  return (
    <Suspense>
      <Content motivo={motivo ?? "invalido"} />
    </Suspense>
  )
}
