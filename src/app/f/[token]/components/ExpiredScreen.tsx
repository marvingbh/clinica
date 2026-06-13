import { Clock } from "lucide-react"

/** Polite "link expired" screen — never leaks any patient/clinic data. */
export function ExpiredScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-canvas">
      <Clock className="w-10 h-10 text-ink-400" strokeWidth={1.5} />
      <h1 className="mt-4 text-[18px] font-semibold text-ink-900">Este link expirou</h1>
      <p className="mt-2 text-[14px] text-ink-600 max-w-xs">
        Peça um novo link à clínica para preencher o formulário.
      </p>
    </div>
  )
}
