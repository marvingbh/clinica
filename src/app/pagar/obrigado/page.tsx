import { CheckCircleIcon } from "@/shared/components/ui/icons"

/** Public success page shown after a Stripe Checkout payment completes. */
export default function PagamentoObrigadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircleIcon className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Pagamento confirmado!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Obrigado. Seu pagamento foi recebido e sua fatura será baixada automaticamente.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Você já pode fechar esta página.
        </p>
      </div>
    </main>
  )
}
