import { Spinner } from "@/shared/components/ui/button"
import { Card, CardContent } from "@/shared/components/ui/card"

interface WaitingScreenProps {
  scheduledAt: string
}

export function WaitingScreen({ scheduledAt }: WaitingScreenProps) {
  const d = new Date(scheduledAt)
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner className="h-8 w-8" />
          <p className="text-base text-foreground">
            Aguardando o(a) profissional entrar na sala...
          </p>
          <p className="text-sm text-muted-foreground">
            {date} às {time}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
