"use client"

import { useState, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { useMountEffect } from "@/shared/hooks"
import {
  HomeIcon,
  CalendarIcon,
  CalendarDaysIcon,
  StethoscopeIcon,
  UserIcon,
  UsersIcon,
  SettingsIcon,
  LogOutIcon,
  ShieldIcon,
  DollarSignIcon,
  FileTextIcon,
  BarChart3Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ReceiptIcon,
  CoinsIcon,
  TagIcon,
  ArrowLeftRightIcon,
  ListChecksIcon,
} from "./icons"
import { usePermission } from "@/shared/hooks/usePermission"
import type { Feature } from "@/lib/rbac/types"
import { useSidebar } from "./sidebar-context"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  matchPaths?: string[]
  feature?: Feature
  badge?: { label: string; tone: "brand" | "warn" | "ok" | "neutral" }
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Principal",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: <HomeIcon className="w-4 h-4" strokeWidth={1.75} />,
      },
      {
        href: "/agenda/weekly",
        label: "Agenda",
        icon: <CalendarIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/agenda"],
        feature: "agenda_own",
      },
      {
        href: "/tarefas",
        label: "Tarefas",
        icon: <ListChecksIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/tarefas"],
        feature: "todos",
      },
      {
        href: "/patients",
        label: "Pacientes",
        icon: <UsersIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/patients"],
        feature: "patients",
      },
      {
        href: "/professionals",
        label: "Profissionais",
        icon: <StethoscopeIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/professionals", "/admin/professionals"],
        feature: "professionals",
      },
      {
        href: "/groups",
        label: "Grupos",
        icon: <UsersIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/groups"],
        feature: "groups",
      },
    ],
  },
  {
    label: "Financeiro",
    items: [
      {
        href: "/financeiro",
        label: "Dashboard",
        icon: <DollarSignIcon className="w-4 h-4" strokeWidth={1.75} />,
        /* matchPaths left empty on purpose — the `exact` check in isActive
           uses a strict `===` match when there's no matchPaths so that
           the Dashboard link doesn't light up on every /financeiro/* sub-route. */
        feature: "finances",
      },
      {
        href: "/financeiro/faturas",
        label: "Faturas",
        icon: <FileTextIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/faturas"],
        feature: "finances",
      },
      {
        href: "/financeiro/despesas",
        label: "Despesas",
        icon: <ReceiptIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/despesas"],
        feature: "expenses",
      },
      {
        href: "/financeiro/fluxo-de-caixa",
        label: "Fluxo de caixa",
        icon: <BarChart3Icon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/fluxo-de-caixa"],
        feature: "finances",
      },
      {
        href: "/financeiro/creditos",
        label: "Créditos",
        icon: <CoinsIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/creditos"],
        feature: "finances",
      },
      {
        href: "/financeiro/precos",
        label: "Preços",
        icon: <TagIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/precos"],
        feature: "finances",
      },
      {
        href: "/financeiro/repasse",
        label: "Repasse",
        icon: <ArrowLeftRightIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/repasse"],
        feature: "finances",
      },
      {
        href: "/financeiro/conciliacao",
        label: "Conciliação",
        icon: <ListChecksIcon className="w-4 h-4" strokeWidth={1.75} />,
        matchPaths: ["/financeiro/conciliacao"],
        feature: "finances",
      },
    ],
  },
]

const toneClass: Record<NonNullable<NavItem["badge"]>["tone"], string> = {
  brand: "bg-brand-50 text-brand-700 border border-brand-100",
  warn: "bg-warn-50 text-warn-700 border border-warn-100",
  ok: "bg-ok-50 text-ok-700 border border-ok-100",
  neutral: "bg-ink-100 text-ink-700 border border-ink-200",
}

function NavBadge({ label, tone }: NonNullable<NavItem["badge"]>) {
  return (
    <span
      className={`ml-auto inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tracking-wide ${toneClass[tone]}`}
    >
      {label}
    </span>
  )
}

function UserMenu({
  onClose,
  collapsed,
}: {
  onClose: () => void
  collapsed: boolean
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const { canWrite: canManagePermissions } = usePermission("users")

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  const positionClass = collapsed
    ? "absolute bottom-0 left-[calc(100%+8px)] w-56"
    : "absolute bottom-[calc(100%+8px)] left-3 right-3"

  return (
    <div className={`${positionClass} rounded-lg border border-ink-200 bg-card shadow-[var(--shadow-lg)] py-1 text-ink-800 animate-scale-in origin-bottom`}>
      <div className="px-3 py-2.5 border-b border-ink-100">
        <p className="text-[13px] font-medium text-ink-900 truncate leading-tight">
          {session?.user?.name}
        </p>
        <p className="text-[11px] text-ink-500 truncate font-mono mt-0.5">
          {session?.user?.email}
        </p>
      </div>
      <MenuItem href="/profile" onSelect={onClose} icon={<UserIcon className="w-4 h-4" strokeWidth={1.75} />}>
        Meu perfil
      </MenuItem>
      <MenuItem
        href="/settings/availability"
        onSelect={onClose}
        icon={<CalendarDaysIcon className="w-4 h-4" strokeWidth={1.75} />}
      >
        Disponibilidade
      </MenuItem>
      {canManagePermissions && (
        <>
          <MenuItem
            href="/admin/settings"
            onSelect={onClose}
            icon={<SettingsIcon className="w-4 h-4" strokeWidth={1.75} />}
          >
            Configurações
          </MenuItem>
          <MenuItem
            href="/admin/permissions"
            onSelect={onClose}
            icon={<ShieldIcon className="w-4 h-4" strokeWidth={1.75} />}
          >
            Permissões
          </MenuItem>
        </>
      )}
      <div className="border-t border-ink-100 mt-1 pt-1">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-err-700 hover:bg-err-50 transition-colors duration-[120ms]"
        >
          <LogOutIcon className="w-4 h-4" strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </div>
  )
}

function MenuItem({
  href,
  icon,
  children,
  onSelect,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onSelect: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-[120ms]"
    >
      <span className="text-ink-500">{icon}</span>
      {children}
    </Link>
  )
}

export function SidebarNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const { collapsed, toggle } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  useMountEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (footerRef.current && !footerRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  })

  const permissions = session?.user?.permissions

  const publicPaths = ["/login", "/confirm", "/cancel", "/intake"]
  if (publicPaths.some((p) => pathname.startsWith(p)) || status === "unauthenticated") {
    return null
  }

  const isActive = (item: NavItem) => {
    if (item.matchPaths) return item.matchPaths.some((p) => pathname.startsWith(p))
    return pathname === item.href
  }

  const filterGroup = (group: NavGroup) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!item.feature) return true
      const access = permissions?.[item.feature]
      return access === "READ" || access === "WRITE"
    }),
  })

  const visibleGroups = navGroups.map(filterGroup).filter((g) => g.items.length > 0)

  const firstName = session?.user?.name?.split(" ")[0] ?? "Usuário"
  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "U"
  const userRole = session?.user?.role === "ADMIN" ? "Administrador" : "Profissional"

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 bottom-0 z-40 ${collapsed ? "w-[64px]" : "w-[220px]"} flex-col gap-4 border-r border-ink-200 bg-card ${collapsed ? "px-2" : "px-3"} py-5 transition-[width] duration-200`}
      aria-label="Menu principal"
    >
      {/* Clinic brand header + collapse toggle */}
      <div
        className={`flex items-center pb-4 border-b border-ink-200 ${collapsed ? "flex-col gap-2" : "gap-2.5 px-3"}`}
      >
        <div
          className="grid place-items-center w-7 h-7 rounded-[2px] bg-brand-500 text-white shadow-[var(--shadow-md)] flex-shrink-0"
          aria-hidden="true"
        >
          <StethoscopeIcon className="w-4 h-4" strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink-900 leading-tight truncate">
              Clínica
            </div>
            <div className="text-[11px] text-ink-500 font-mono mt-0.5 truncate">
              {firstName}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="grid place-items-center w-7 h-7 rounded-[4px] text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors duration-[120ms] flex-shrink-0"
        >
          {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
        </button>
      </div>

      {/* Groups */}
      <nav className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
        {visibleGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`
                    flex items-center rounded-[4px] py-2 text-[13px]
                    transition-colors duration-[120ms]
                    ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}
                    ${active
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-ink-700 hover:bg-ink-100 hover:text-ink-900"
                    }
                  `}
                >
                  <span className={active ? "text-brand-600" : "text-ink-500"}>
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.badge && <NavBadge {...item.badge} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div
        ref={footerRef}
        className={`mt-auto relative border-t border-ink-200 ${collapsed ? "-mx-2 -mb-5 px-2" : "-mx-3 -mb-5 px-3"} pt-3 pb-4`}
      >
        {menuOpen && <UserMenu onClose={() => setMenuOpen(false)} collapsed={collapsed} />}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={collapsed ? session?.user?.name ?? undefined : undefined}
          className={`w-full flex items-center rounded-[4px] py-1.5 hover:bg-ink-50 transition-colors duration-[120ms] ${collapsed ? "justify-center px-0" : "gap-2.5 px-1.5"}`}
        >
          <span
            className="grid place-items-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 border border-brand-200 text-[13px] font-semibold flex-shrink-0"
            aria-hidden="true"
          >
            {initials}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 text-left flex-1">
                <div className="text-[13px] font-medium text-ink-800 truncate leading-tight">
                  {session?.user?.name}
                </div>
                <div className="text-[11px] text-ink-500 truncate mt-0.5">{userRole}</div>
              </div>
              <ChevronDownIcon
                className={`w-4 h-4 text-ink-400 transition-transform duration-[120ms] ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
