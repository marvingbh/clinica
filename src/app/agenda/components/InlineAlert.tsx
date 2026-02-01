"use client"

import { AlertTriangleIcon, XIcon } from "@/shared/components/ui/icons"

interface InlineAlertProps {
  message: string | null
  onDismiss: () => void
  variant?: "error" | "warning"
}

export function InlineAlert({ message, onDismiss, variant = "error" }: InlineAlertProps) {
  if (!message) return null

  const styles = {
    error: {
      container: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      text: "text-red-800 dark:text-red-200",
      icon: "text-red-600 dark:text-red-400",
      button: "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50",
    },
    warning: {
      container: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
      text: "text-orange-800 dark:text-orange-200",
      icon: "text-orange-600 dark:text-orange-400",
      button: "text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/50",
    },
  }

  const style = styles[variant]

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md border ${style.container} animate-in fade-in slide-in-from-top-2 duration-200`}
      role="alert"
    >
      <AlertTriangleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.icon}`} />
      <p className={`flex-1 text-sm ${style.text}`}>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className={`flex-shrink-0 p-1 rounded-md transition-colors ${style.button}`}
        aria-label="Fechar alerta"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
