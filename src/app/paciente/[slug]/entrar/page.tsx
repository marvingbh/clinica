"use client"

import { useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useMountEffect } from "@/shared/hooks"

type State = "exchanging" | "error"

export default function EntrarPage() {
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<State>("exchanging")

  useMountEffect(() => {
    const token = search.get("token")
    if (!token) {
      setState("error")
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/public/portal/${params.slug}/session/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        if (!res.ok) {
          setState("error")
          return
        }
        router.replace(`/paciente/${params.slug}`)
      } catch {
        setState("error")
      }
    })()
  })

  return (
    <main className="min-h-screen flex items-center justify-center px-4 text-center">
      {state === "exchanging" ? (
        <p className="text-sm text-muted-foreground animate-pulse">Entrando...</p>
      ) : (
        <div className="space-y-3">
          <p className="text-foreground font-medium">
            Link expirado — entre com seu telefone ou e-mail.
          </p>
          <a href={`/paciente/${params.slug}`} className="text-brand-600 text-sm underline">
            Ir para o login
          </a>
        </div>
      )}
    </main>
  )
}
