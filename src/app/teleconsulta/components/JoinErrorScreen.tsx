import { CalendarClock, XCircle, PhoneOff } from "lucide-react"
import { Card, CardContent } from "@/shared/components/ui/card"

export type JoinErrorKind =
  | "TOO_EARLY"
  | "ENDED"
  | "CANCELLED"
  | "NOT_ONLINE"
  | "DISABLED"
  | "INVALID"
  | "CONNECTION"

interface JoinErrorScreenProps {
  kind: JoinErrorKind
  scheduledAt?: string | null
  clinicPhone?: string | null
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
}

export function JoinErrorScreen({ kind, scheduledAt, clinicPhone }: JoinErrorScreenProps) {
  let icon = <XCircle className="h-10 w-10 text-muted-foreground" />
  let message: string

  switch (kind) {
    case "TOO_EARLY": {
      icon = <CalendarClock className="h-10 w-10 text-primary" />
      if (scheduledAt) {
        const { date, time } = formatDateTime(scheduledAt)
        message = `Sua teleconsulta está agendada para ${date} às ${time}. A sala abre 15 minutos antes do horário.`
      } else {
        message = "A sala abre 15 minutos antes do horário agendado."
      }
      break
    }
    case "ENDED":
      message = "Esta sessão já foi encerrada. Em caso de dúvida, entre em contato com a clínica."
      break
    case "CANCELLED":
      message = "Esta sessão foi cancelada. Entre em contato com a clínica para reagendar."
      break
    case "NOT_ONLINE":
      message = "Esta consulta será presencial. Em caso de dúvida, entre em contato com a clínica."
      break
    case "DISABLED":
      message = "A teleconsulta não está disponível. Entre em contato com a clínica."
      break
    case "CONNECTION":
      icon = <PhoneOff className="h-10 w-10 text-destructive" />
      message = "Não foi possível conectar. Verifique sua internet e tente novamente."
      break
    default:
      message = "Link de teleconsulta inválido. Confira o link recebido ou entre em contato com a clínica."
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {icon}
          <p className="text-base text-foreground">{message}</p>
          {clinicPhone ? (
            <p className="text-sm text-muted-foreground">
              Precisa de ajuda? Ligue para {clinicPhone}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
