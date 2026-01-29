"use client"

import { AlertTriangleIcon, InboxIcon, WifiOffIcon } from "./icons"

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
  icon?: React.ReactNode
  className?: string
}

export function ErrorState({
  title = "Algo deu errado",
  message = "Nao foi possivel carregar os dados. Tente novamente.",
  onRetry,
  retryLabel = "Tentar novamente",
  icon,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
      role="alert"
    >
      <div className="w-16 h-16 mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
        {icon || <AlertTriangleIcon className="w-8 h-8 text-destructive" />}
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">{message}</p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="h-12 px-6 min-w-[120px] rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 active:scale-98 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all touch-manipulation"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  message?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
    >
      <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
        {icon || <InboxIcon className="w-8 h-8 text-muted-foreground" />}
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {message && (
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">{message}</p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="h-12 px-6 min-w-[120px] rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted active:scale-98 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all touch-manipulation"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

interface OfflineStateProps {
  onRetry?: () => void
  className?: string
}

export function OfflineState({ onRetry, className = "" }: OfflineStateProps) {
  return (
    <ErrorState
      title="Sem conexao"
      message="Verifique sua conexao com a internet e tente novamente."
      onRetry={onRetry}
      icon={<WifiOffIcon className="w-8 h-8 text-muted-foreground" />}
      className={className}
    />
  )
}
