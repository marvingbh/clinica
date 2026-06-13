"use client"

import React from "react"
import { RelatoriosProvider } from "./context/RelatoriosContext"
import { RelatoriosFilterBar } from "./components/RelatoriosFilterBar"

export default function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  return (
    <RelatoriosProvider>
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Relatórios</h1>
        <RelatoriosFilterBar />
        {children}
      </div>
    </RelatoriosProvider>
  )
}
