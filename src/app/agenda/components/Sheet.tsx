"use client"

import { ReactNode } from "react"

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Sheet({ isOpen, onClose, title, children }: SheetProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Handle */}
        <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border">
          <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        </div>

        {children}
      </div>
    </>
  )
}

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {title}
          </h3>
          {children}
        </div>
      </div>
    </>
  )
}
