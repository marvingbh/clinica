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
      container: "bg-red-50 border-red-200",
      text: "text-red-800",
      icon: "text-red-600",
      button: "text-red-600 hover:text-red-800 hover:bg-red-100",
    },
    warning: {
      container: "bg-orange-50 border-orange-200",
      text: "text-orange-800",
      icon: "text-orange-600",
      button: "text-orange-600 hover:text-orange-800 hover:bg-orange-100",
    },
  }

  const style = styles[variant]

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${style.container} animate-scale-in`}
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
