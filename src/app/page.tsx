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
  PlusIcon,
  ClockIcon,
  StethoscopeIcon,
} from "@/shared/components/ui/icons"
import { Card, CardContent } from "@/shared/components/ui/card"
import { Skeleton, SkeletonAvatar, SkeletonText } from "@/shared/components/ui/skeleton"
import { FAB } from "@/shared/components/ui/fab"

function HomeSkeleton() {
  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Hero Section Skeleton */}
      <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-8">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>

      {/* Quick Stats Skeleton */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[1, 2].map((i) => (
            <Card key={i} elevation="md" className="p-4">
              <Skeleton className="h-8 w-12 mb-2" />
              <Skeleton className="h-4 w-20" />
            </Card>
          ))}
        </div>
      </div>

      {/* Action Cards Skeleton */}
      <div className="max-w-4xl mx-auto px-4">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} elevation="sm" className="p-4">
              <div className="flex items-center gap-4">
                <SkeletonAvatar size="lg" />
                <div className="flex-1">
                  <SkeletonText lines={2} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}

function QuickStatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType
  value: string | number
  label: string
  color: string
}) {
  return (
    <Card elevation="md" hoverable className="overflow-hidden">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ActionCardProps {
  href: string
  icon: React.ElementType
  iconBgColor: string
  iconColor: string
  title: string
  description: string
}

function ActionCard({ href, icon: Icon, iconBgColor, iconColor, title, description }: ActionCardProps) {
  return (
    <Link href={href}>
      <Card elevation="sm" hoverable className="group">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${iconBgColor} flex items-center justify-center flex-shrink-0 transition-transform duration-normal group-hover:scale-105`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground truncate">{description}</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-normal group-hover:translate-x-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function LogoutCard({ onLogout }: { onLogout: () => void }) {
  return (
    <button onClick={onLogout} className="w-full text-left">
      <Card elevation="sm" hoverable className="group">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0 transition-transform duration-normal group-hover:scale-105">
              <LogOutIcon className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-destructive">Sair</p>
              <p className="text-sm text-muted-foreground">Encerrar sessão</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  function handleNewAppointment() {
    router.push("/agenda")
  }

  // Loading state with skeleton
  if (status === "loading") {
    return <HomeSkeleton />
  }

  // Not authenticated - show login prompt
  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <StethoscopeIcon className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Clínica</h1>
            <p className="mt-2 text-muted-foreground">Sistema de gestão de consultas</p>
          </div>

          <Card elevation="lg" className="p-6">
            <p className="text-sm text-muted-foreground mb-6">
              Faça login para acessar sua agenda e gerenciar pacientes.
            </p>
            <Link
              href="/login"
              className="block w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all duration-normal active:scale-[0.98] flex items-center justify-center shadow-md hover:shadow-lg"
            >
              Entrar
            </Link>
          </Card>
        </div>
      </main>
    )
  }

  // Get current time greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  const firstName = session?.user?.name?.split(" ")[0] || "Usuário"

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground text-sm font-medium">{greeting},</p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mt-1">
            {firstName}
          </h1>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 gap-3 mb-8">
          <QuickStatCard
            icon={CalendarIcon}
            value="—"
            label="Hoje"
            color="bg-info"
          />
          <QuickStatCard
            icon={ClockIcon}
            value="—"
            label="Pendentes"
            color="bg-warning"
          />
        </div>
      </div>

      {/* Action Cards */}
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Menu Principal
        </h2>

        <div className="space-y-3">
          <ActionCard
            href="/agenda"
            icon={CalendarIcon}
            iconBgColor="bg-primary/10"
            iconColor="text-primary"
            title="Agenda"
            description="Ver e gerenciar agendamentos"
          />

          <ActionCard
            href="/patients"
            icon={UsersIcon}
            iconBgColor="bg-success/10"
            iconColor="text-success"
            title="Pacientes"
            description="Cadastro e histórico"
          />

          {session?.user?.role === "ADMIN" && (
            <ActionCard
              href="/professionals"
              icon={StethoscopeIcon}
              iconBgColor="bg-warning/10"
              iconColor="text-warning"
              title="Profissionais"
              description="Gerenciar equipe"
            />
          )}

          <ActionCard
            href="/settings/availability"
            icon={SettingsIcon}
            iconBgColor="bg-info/10"
            iconColor="text-info"
            title="Configurações"
            description="Disponibilidade e preferências"
          />
        </div>

        {/* Account Section */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-8 mb-4">
          Conta
        </h2>

        <div className="space-y-3">
          <ActionCard
            href="/profile"
            icon={UserIcon}
            iconBgColor="bg-gray-100 dark:bg-gray-800"
            iconColor="text-gray-600 dark:text-gray-400"
            title="Meu Perfil"
            description="Dados pessoais e profissionais"
          />

          <LogoutCard onLogout={handleLogout} />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          {session?.user?.email}
        </p>
      </div>

      {/* FAB for primary action - New Appointment */}
      <FAB
        onClick={handleNewAppointment}
        icon={<PlusIcon className="w-6 h-6" />}
        label="Novo agendamento"
        color="primary"
        elevation="lg"
      />
    </main>
  )
}
