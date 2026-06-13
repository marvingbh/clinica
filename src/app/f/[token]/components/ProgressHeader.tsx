"use client"

interface ProgressHeaderProps {
  clinicName: string
  formName: string
  percent: number
}

/** Sticky header with clinic name, form title, progress bar and the LGPD notice. */
export function ProgressHeader({ clinicName, formName, percent }: ProgressHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-card border-b border-ink-100">
      <div className="max-w-md mx-auto px-4 pt-4 pb-3">
        <p className="text-[12px] font-medium text-ink-500 uppercase tracking-wide">{clinicName}</p>
        <h1 className="text-[18px] font-semibold text-ink-900 mt-0.5">{formName}</h1>
        <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
          <div
            className="h-full bg-ink-900 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-500 leading-snug">
          Suas respostas contêm dados sensíveis de saúde e serão visíveis ao profissional
          responsável pelo seu atendimento.
        </p>
      </div>
    </div>
  )
}
