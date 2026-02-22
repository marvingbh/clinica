"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/financeiro", label: "Dashboard", exact: true },
  { href: "/financeiro/faturas", label: "Faturas" },
  { href: "/financeiro/creditos", label: "Créditos" },
  { href: "/financeiro/precos", label: "Preços" },
]

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Financeiro</h1>
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(tab => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
