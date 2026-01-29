"use client"

import { usePathname, useRouter } from "next/navigation"
import { HomeIcon, CalendarIcon, UsersIcon, SettingsIcon } from "./icons"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  matchPaths?: string[]
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Início",
    icon: <HomeIcon className="w-6 h-6" />,
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: <CalendarIcon className="w-6 h-6" />,
    matchPaths: ["/agenda"],
  },
  {
    href: "/patients",
    label: "Pacientes",
    icon: <UsersIcon className="w-6 h-6" />,
    matchPaths: ["/patients"],
  },
  {
    href: "/settings/availability",
    label: "Config",
    icon: <SettingsIcon className="w-6 h-6" />,
    matchPaths: ["/settings", "/admin"],
  },
]

export function BottomNavigation() {
  const router = useRouter()
  const pathname = usePathname()

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((path) => pathname.startsWith(path))
    }
    return pathname === item.href
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border z-40 safe-area-pb">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const active = isActive(item)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] py-2 px-3 rounded-lg transition-colors touch-manipulation ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:bg-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.icon}
                <span className={`text-xs ${active ? "font-medium" : ""}`}>
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
