import { CheckCircle2 } from "lucide-react"

/** Success screen shown after a completed submission. */
export function DoneScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-canvas">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" strokeWidth={1.5} />
      <h1 className="mt-4 text-[18px] font-semibold text-ink-900">Respostas enviadas. Obrigado!</h1>
      <p className="mt-2 text-[14px] text-ink-600 max-w-xs">
        Você já pode fechar esta página.
      </p>
    </div>
  )
}
