"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, History, Receipt, FileText, UserRound, LogOut } from "lucide-react"
import { usePortal } from "./PortalSessionProvider"
import { ProfileSwitcher } from "./ProfileSwitcher"

const ITEMS = [
  { key: "", label: "Sessões", icon: CalendarDays },
  { key: "historico", label: "Histórico", icon: History },
  { key: "financeiro", label: "Financeiro", icon: Receipt },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "dados", label: "Dados", icon: UserRound },
] as const

export function PortalNav() {
  const { slug, me, logout } = usePortal()
  const pathname = usePathname()
  const base = `/paciente/${slug}`
  // AGENDA-scope sessions only get the sessions tab.
  const items = me?.scope === "AGENDA" ? ITEMS.filter((i) => i.key === "") : ITEMS

  function hrefFor(key: string) {
    return key ? `${base}/${key}` : base
  }

  function isActive(key: string) {
    const href = hrefFor(key)
    return key === "" ? pathname === base : pathname.startsWith(href)
  }

  return (
    <>
      {/* Desktop header */}
      <header className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-foreground">{me?.clinic.name ?? "Portal"}</span>
          <nav className="flex items-center gap-1">
            {items.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={hrefFor(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                  isActive(key)
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ProfileSwitcher />
          <button
            onClick={() => void logout()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </header>

      {/* Mobile bottom-nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-border bg-card">
        {items.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={hrefFor(key)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
              isActive(key) ? "text-brand-600" : "text-muted-foreground"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
