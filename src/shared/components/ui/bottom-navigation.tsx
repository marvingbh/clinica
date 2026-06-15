"use client"

import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { HomeIcon, CalendarIcon, StethoscopeIcon, UserIcon, UsersIcon, DollarSignIcon, ListChecksIcon, FileTextIcon } from "./icons"
import type { Feature } from "@/lib/rbac/types"
import { isPublicPagePath } from "@/lib/routes/public-paths"
import { usePendingIntake } from "@/shared/components/PendingIntakeProvider"
import { usePendingBookingCount } from "@/shared/hooks"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  activeIcon: React.ReactNode
  matchPaths?: string[]
  feature?: Feature
  /** Minimum access required to see the item; defaults to READ. */
  minAccess?: "READ" | "WRITE"
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: <HomeIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <HomeIcon className="w-6 h-6" strokeWidth={2} />,
  },
  {
    href: "/agenda/weekly",
    label: "Agenda",
    icon: <CalendarIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <CalendarIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/agenda"],
    feature: "agenda_own",
  },
  {
    href: "/tarefas",
    label: "Tarefas",
    icon: <ListChecksIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <ListChecksIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/tarefas"],
    feature: "todos",
  },
  {
    href: "/professionals",
    label: "Profissionais",
    icon: <StethoscopeIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <StethoscopeIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/professionals", "/admin/professionals"],
    feature: "professionals",
  },
  {
    href: "/groups",
    label: "Grupos",
    icon: <UsersIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <UsersIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/groups"],
    feature: "groups",
  },
  {
    href: "/prontuario",
    label: "Prontuário",
    icon: <FileTextIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <FileTextIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/prontuario"],
    feature: "prontuario",
    minAccess: "WRITE",
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: <DollarSignIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <DollarSignIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/financeiro"],
    feature: "finances",
  },
  {
    href: "/profile",
    label: "Perfil",
    icon: <UserIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <UserIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/profile", "/settings"],
  },
]

export function BottomNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status } = useSession()

  const permissions = session?.user?.permissions
  const { count: pendingIntakeCount } = usePendingIntake()
  const { count: pendingBookingCount } = usePendingBookingCount()

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((path) => pathname.startsWith(path))
    }
    return pathname === item.href
  }

  // Don't render on public pages, on the landing (/) when logged out, or when
  // not authenticated at all.
  const isLandingAnon = pathname === "/" && status === "unauthenticated"
  if (isPublicPagePath(pathname) || isLandingAnon || status !== "authenticated") {
    return null
  }

  const visibleItems = navItems.filter((item) => {
    if (!item.feature) return true
    const access = permissions?.[item.feature]
    if (item.minAccess === "WRITE") return access === "WRITE"
    return access === "READ" || access === "WRITE"
  })

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-background border-t border-border z-40 safe-area-pb md:hidden"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto px-2">
        <div className="flex items-center justify-around h-16">
          {visibleItems.map((item) => {
            const active = isActive(item)
            const showDot =
              (item.href === "/patients" && pendingIntakeCount > 0) ||
              (item.href === "/agenda/weekly" && pendingBookingCount > 0)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`
                  flex flex-col items-center justify-center gap-0.5
                  min-w-[64px] min-h-[44px] py-1.5 px-3 rounded-lg
                  transition-all duration-normal ease-in-out
                  touch-manipulation
                  ${active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:bg-muted"
                  }
                `}
                aria-current={active ? "page" : undefined}
                aria-label={showDot ? `${item.label} — pendente(s)` : item.label}
              >
                <span
                  className={`
                    relative transition-transform duration-normal ease-in-out
                    ${active ? "scale-110" : "scale-100"}
                  `}
                >
                  {active ? item.activeIcon : item.icon}
                  {showDot && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-warn-500 ring-2 ring-background"
                    />
                  )}
                </span>
                <span
                  className={`
                    text-[11px] leading-tight
                    transition-all duration-normal ease-in-out
                    ${active ? "font-semibold" : "font-normal"}
                  `}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
