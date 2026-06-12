"use client"

import { useRouter } from "next/navigation"
import { useRequireAuth } from "@/shared/hooks"
import { BookingRequestList } from "./components/BookingRequestList"

export default function SolicitacoesPage() {
  const router = useRouter()
  const { status } = useRequireAuth({ feature: "online_booking", minAccess: "READ" })

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          &larr; Voltar
        </button>
        <h1 className="text-2xl font-semibold text-foreground mb-6">Solicitações</h1>
        <BookingRequestList />
      </div>
    </main>
  )
}
