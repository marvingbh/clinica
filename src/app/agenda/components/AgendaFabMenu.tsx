"use client"

import { createPortal } from "react-dom"
import {
  FAB,
  StethoscopeIcon,
  ClipboardListIcon,
  BellIcon,
  StickyNoteIcon,
  UsersRoundIcon,
  XIcon,
} from "@/shared/components/ui"
import type { CalendarEntryType } from "../lib/types"

interface AgendaFabMenuProps {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSelect: (type: CalendarEntryType | "CONSULTA") => void
}

const MENU_ITEMS: Array<{ type: CalendarEntryType | "CONSULTA"; label: string; icon: React.ReactNode; bgClass: string }> = [
  {
    type: "CONSULTA",
    label: "Consulta",
    icon: <StethoscopeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
    bgClass: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    type: "TAREFA",
    label: "Tarefa",
    icon: <ClipboardListIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    bgClass: "bg-amber-100 dark:bg-amber-900/30",
  },
  {
    type: "LEMBRETE",
    label: "Lembrete",
    icon: <BellIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />,
    bgClass: "bg-sky-100 dark:bg-sky-900/30",
  },
  {
    type: "NOTA",
    label: "Nota",
    icon: <StickyNoteIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />,
    bgClass: "bg-slate-100 dark:bg-slate-900/30",
  },
  {
    type: "REUNIAO",
    label: "Reuniao",
    icon: <UsersRoundIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />,
    bgClass: "bg-violet-100 dark:bg-violet-900/30",
  },
]

export function AgendaFabMenu({ isOpen, onOpen, onClose, onSelect }: AgendaFabMenuProps) {
  if (typeof document === "undefined") return null

  return createPortal(
    <>
      <FAB onClick={onOpen} label="Novo" />

      {isOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <div className="absolute right-4 bottom-24 z-50 flex flex-col-reverse items-end gap-2">
            <button
              onClick={onClose}
              className="w-14 h-14 rounded-full bg-muted text-muted-foreground shadow-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
              aria-label="Fechar menu"
            >
              <XIcon className="w-6 h-6" />
            </button>

            {MENU_ITEMS.map((item) => (
              <button
                key={item.type}
                onClick={() => onSelect(item.type)}
                className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full ${item.bgClass} flex items-center justify-center`}>
                  {item.icon}
                </div>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
