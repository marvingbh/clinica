"use client"

import { AgendaProvider } from "./context/AgendaContext"

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return <AgendaProvider>{children}</AgendaProvider>
}
