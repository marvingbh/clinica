"use client"

import { createPortal } from "react-dom"
import {
  FAB,
  XIcon,
  StethoscopeIcon,
  ClipboardListIcon,
  BellIcon,
  StickyNoteIcon,
  UsersRoundIcon,
} from "@/shared/components/ui"
import type { FabMenuProps } from "./types"

export function FabMenu({ isOpen, onOpen, onClose, onSelect }: FabMenuProps) {
  if (typeof document === "undefined") return null

  return createPortal(
    <>
      <FAB onClick={onOpen} label="Novo" />

      {isOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <div className="absolute right-4 bottom-24 z-50 flex flex-col-reverse items-end gap-2">
            {/* Close button */}
            <button
              onClick={onClose}
              className="w-14 h-14 rounded-full bg-muted text-muted-foreground shadow-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
              aria-label="Fechar menu"
            >
              <XIcon className="w-6 h-6" />
            </button>

            {/* Menu items */}
            <button
              onClick={() => onSelect("CONSULTA")}
              className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <StethoscopeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Consulta</span>
            </button>

            <button
              onClick={() => onSelect("TAREFA")}
              className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ClipboardListIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Tarefa</span>
            </button>

            <button
              onClick={() => onSelect("LEMBRETE")}
              className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <BellIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Lembrete</span>
            </button>

            <button
              onClick={() => onSelect("NOTA")}
              className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
                <StickyNoteIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Nota</span>
            </button>

            <button
              onClick={() => onSelect("REUNIAO")}
              className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <UsersRoundIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Reuniao</span>
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
