"use client"

import { usePathname, useRouter } from "next/navigation"
import { HomeIcon, CalendarIcon, StethoscopeIcon, UserIcon } from "./icons"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  activeIcon: React.ReactNode
  matchPaths?: string[]
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: <HomeIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <HomeIcon className="w-6 h-6" strokeWidth={2} />,
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: <CalendarIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <CalendarIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/agenda"],
  },
  {
    href: "/professionals",
    label: "Professionals",
    icon: <StethoscopeIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <StethoscopeIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/professionals", "/admin/professionals"],
  },
  {
    href: "/profile",
    label: "Profile",
    icon: <UserIcon className="w-6 h-6" strokeWidth={1.5} />,
    activeIcon: <UserIcon className="w-6 h-6" strokeWidth={2} />,
    matchPaths: ["/profile", "/settings"],
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

  // Don't render on public pages
  const publicPaths = ["/login", "/confirm", "/cancel"]
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return null
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-background border-t border-border z-40 safe-area-pb md:hidden"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto px-2">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const active = isActive(item)
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
                aria-label={item.label}
              >
                <span
                  className={`
                    transition-transform duration-normal ease-in-out
                    ${active ? "scale-110" : "scale-100"}
                  `}
                >
                  {active ? item.activeIcon : item.icon}
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
