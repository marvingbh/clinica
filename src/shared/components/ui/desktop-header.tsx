"use client"

import { useState, useRef, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { useTheme } from "@/shared/components/theme-provider"
import {
  HomeIcon,
  CalendarIcon,
  StethoscopeIcon,
  UserIcon,
  UsersIcon,
  SettingsIcon,
  LogOutIcon,
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
} from "./icons"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  matchPaths?: string[]
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: <HomeIcon className="w-4 h-4" />,
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: <CalendarIcon className="w-4 h-4" />,
    matchPaths: ["/agenda"],
  },
  {
    href: "/professionals",
    label: "Profissionais",
    icon: <StethoscopeIcon className="w-4 h-4" />,
    matchPaths: ["/professionals", "/admin/professionals"],
  },
  {
    href: "/patients",
    label: "Pacientes",
    icon: <UserIcon className="w-4 h-4" />,
    matchPaths: ["/patients"],
  },
  {
    href: "/groups",
    label: "Grupos",
    icon: <UsersIcon className="w-4 h-4" />,
    matchPaths: ["/groups"],
  },
]

function UserDropdown() {
  const router = useRouter()
  const { data: session } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  const firstName = session?.user?.name?.split(" ")[0] || "Usuário"
  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U"

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors duration-normal group"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
          {initials}
        </div>
        <span className="hidden lg:inline">{firstName}</span>
        <ChevronDownIcon
          className={`w-4 h-4 text-muted-foreground transition-transform duration-normal ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-lg py-1 z-50 animate-scale-in origin-top-right">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">
              {session?.user?.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {session?.user?.email}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors duration-normal"
            >
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              Meu Perfil
            </Link>
            <Link
              href="/settings/availability"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors duration-normal"
            >
              <SettingsIcon className="w-4 h-4 text-muted-foreground" />
              Configurações
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors duration-normal"
            >
              <LogOutIcon className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-normal"
      aria-label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"}
      title={theme === "light" ? "Modo escuro" : "Modo claro"}
    >
      {theme === "light" ? (
        <MoonIcon className="w-5 h-5" />
      ) : (
        <SunIcon className="w-5 h-5" />
      )}
    </button>
  )
}

export function DesktopHeader() {
  const pathname = usePathname()
  const { status } = useSession()

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((path) => pathname.startsWith(path))
    }
    return pathname === item.href
  }

  // Don't render on public pages or when not authenticated
  const publicPaths = ["/login", "/confirm", "/cancel"]
  if (publicPaths.some(p => pathname.startsWith(p)) || status === "unauthenticated") {
    return null
  }

  return (
    <header className="hidden md:block fixed top-0 inset-x-0 bg-background/80 backdrop-blur-md border-b border-border z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center transition-transform duration-normal group-hover:scale-105">
              <StethoscopeIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">
              Clínica
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-normal
                    ${active
                      ? "text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }
                  `}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={`transition-transform duration-normal ${active ? "scale-110" : "group-hover:scale-105"}`}>
                    {item.icon}
                  </span>
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Theme toggle + User dropdown */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {status === "authenticated" && <UserDropdown />}
          </div>
        </div>
      </div>
    </header>
  )
}
