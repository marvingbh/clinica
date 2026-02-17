"use client"

import { Card, CardContent } from "@/shared/components/ui/card"

interface UserData {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  professionalProfile: { id: string } | null
}

interface UserCardProps {
  user: UserData
  onClick: () => void
  onEdit?: () => void
  onDeactivate?: () => void
  onReactivate?: () => void
  isAdmin: boolean
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-primary",
    "bg-success",
    "bg-info",
    "bg-warning",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

export function UserCard({
  user,
  onClick,
  onEdit,
  onDeactivate,
  onReactivate,
  isAdmin,
}: UserCardProps) {
  const initials = getInitials(user.name)
  const avatarColor = getAvatarColor(user.name)

  return (
    <Card
      elevation="sm"
      hoverable
      className={`group cursor-pointer transition-all duration-normal ${
        !user.isActive ? "opacity-60" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className={`w-14 h-14 rounded-xl ${avatarColor} flex items-center justify-center flex-shrink-0 transition-transform duration-normal group-hover:scale-105`}
          >
            <span className="text-lg font-semibold text-white">{initials}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">
                {user.name}
              </h3>
              {user.role === "ADMIN" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0">
                  Admin
                </span>
              )}
              {!user.isActive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  Inativo
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate">
              {user.email}
            </p>

            {user.professionalProfile && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                Tem perfil profissional
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons - Only for Admin */}
        {isAdmin && (
          <div className="flex gap-2 mt-4 pt-3 border-t border-border">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.()
              }}
              className="flex-1 h-9 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
            >
              Editar
            </button>
            {user.isActive ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeactivate?.()
                }}
                className="flex-1 h-9 rounded-lg border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onReactivate?.()
                }}
                className="flex-1 h-9 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Reativar
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
