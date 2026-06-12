import { formatPhoneDisplay } from "@/lib/phone"

/**
 * Shown when the clinic's online booking is unavailable (disabled, inactive,
 * or read-only subscription).
 */
export function ClosedNotice({ clinicPhone }: { clinicPhone: string | null }) {
  return (
    <div className="text-center py-10">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-xl">!</span>
      </div>
      <p className="text-foreground font-medium mb-1">
        O agendamento online desta clínica está temporariamente indisponível.
      </p>
      {clinicPhone && (
        <p className="text-sm text-muted-foreground">
          Entre em contato pelo telefone {formatPhoneDisplay(clinicPhone)}.
        </p>
      )}
    </div>
  )
}
