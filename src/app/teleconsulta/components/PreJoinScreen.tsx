"use client"

import { useState } from "react"
import { Video, ShieldCheck } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card"

interface PreJoinScreenProps {
  clinicName: string
  professionalName: string
  scheduledAt: string
  defaultName: string
  onEnter: (displayName: string) => void
}

export function PreJoinScreen({
  clinicName,
  professionalName,
  scheduledAt,
  defaultName,
  onEnter,
}: PreJoinScreenProps) {
  const [name, setName] = useState(defaultName)
  const d = new Date(scheduledAt)
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Video className="mb-2 h-8 w-8 text-primary" />
          <CardTitle>Teleconsulta</CardTitle>
          <p className="text-sm text-muted-foreground">{clinicName}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Profissional:</span> {professionalName}
            </p>
            <p>
              <span className="text-muted-foreground">Data:</span> {date} às {time}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="display-name" className="text-sm font-medium">
              Seu nome
            </label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como deseja ser identificado(a)"
            />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="flex flex-col gap-1">
              <span>Esta sessão não é gravada.</span>
              <span>
                Ao entrar, você concorda com o atendimento por videochamada. Seus dados são
                tratados conforme a LGPD.
              </span>
            </div>
          </div>

          <Button onClick={() => onEnter(name.trim() || defaultName)} className="w-full">
            Entrar na sessão
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
