"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, Building2, CreditCard, LogOut } from "lucide-react"

interface AdminInfo {
  id: string
  email: string
  name: string
}

const navItems = [
  { href: "/superadmin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/superadmin/clinics", label: "Clinicas", icon: Building2 },
  { href: "/superadmin/plans", label: "Planos", icon: CreditCard },
]

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const isLoginPage = pathname === "/superadmin/login"

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false)
      return
    }

    fetch("/api/superadmin/me")
      .then((res) => {
        if (!res.ok) {
          router.replace("/superadmin/login")
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data?.admin) {
          setAdmin(data.admin)
        }
      })
      .catch(() => {
        router.replace("/superadmin/login")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isLoginPage, router])

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  async function handleLogout() {
    await fetch("/api/superadmin/logout", { method: "POST" })
    router.replace("/superadmin/login")
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-lg font-semibold text-foreground">Super Admin</h1>
          {admin && (
            <p className="text-sm text-muted-foreground mt-1">{admin.name}</p>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/superadmin"
                ? pathname === "/superadmin"
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
