"use client"

import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import {
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
  ChevronRightIcon,
} from "@/shared/components/ui/icons"

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  // Loading state
  if (status === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-4" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
      </main>
    )
  }

  // Not authenticated - show login prompt
  if (status === "unauthenticated") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="text-3xl font-semibold text-foreground">Clínica</h1>
        <p className="mt-2 text-muted-foreground mb-8">Sistema de gestão</p>
        <Link
          href="/login"
          className="w-full max-w-xs h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity flex items-center justify-center"
        >
          Entrar
        </Link>
      </main>
    )
  }

  // Authenticated - show menu
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Clínica</h1>
          <p className="text-muted-foreground mt-1">
            Olá, {session?.user?.name || "Usuário"}
          </p>
        </div>

        {/* Menu */}
        <nav className="space-y-3">
          <Link
            href="/agenda"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Agenda</p>
              <p className="text-sm text-muted-foreground">Ver e gerenciar agendamentos</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
          </Link>

          <Link
            href="/patients"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Pacientes</p>
              <p className="text-sm text-muted-foreground">Cadastro e histórico</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
          </Link>

          {session?.user?.role === "ADMIN" && (
            <Link
              href="/professionals"
              className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <UsersIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Profissionais</p>
                <p className="text-sm text-muted-foreground">Gerenciar equipe</p>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
            </Link>
          )}

          <Link
            href="/settings/availability"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Configurações</p>
              <p className="text-sm text-muted-foreground">Disponibilidade e preferências</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
          </Link>

          <hr className="border-border my-4" />

          <Link
            href="/profile"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Meu Perfil</p>
              <p className="text-sm text-muted-foreground">Dados pessoais e profissionais</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <LogOutIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-red-600 dark:text-red-400">Sair</p>
              <p className="text-sm text-muted-foreground">Encerrar sessão</p>
            </div>
          </button>
        </nav>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          {session?.user?.email}
        </p>
      </div>
    </main>
  )
}
