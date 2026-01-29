"use client"

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
        {icon || (
          <svg
            className="w-8 h-8 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )}
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
        {icon || (
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        )}
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
      icon={
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      }
      className={className}
    />
  )
}
