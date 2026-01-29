"use client"

import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"

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
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Agenda</p>
              <p className="text-sm text-muted-foreground">Ver e gerenciar agendamentos</p>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <Link
            href="/patients"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Pacientes</p>
              <p className="text-sm text-muted-foreground">Cadastro e histórico</p>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {session?.user?.role === "ADMIN" && (
            <Link
              href="/professionals"
              className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Profissionais</p>
                <p className="text-sm text-muted-foreground">Gerenciar equipe</p>
              </div>
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          <Link
            href="/settings/availability"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Configurações</p>
              <p className="text-sm text-muted-foreground">Disponibilidade e preferências</p>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <hr className="border-border my-4" />

          <Link
            href="/profile"
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Meu Perfil</p>
              <p className="text-sm text-muted-foreground">Dados pessoais e profissionais</p>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
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
