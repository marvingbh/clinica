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

export type FabMenuSelection = CalendarEntryType | "CONSULTA" | "GROUP_SESSION"

interface AgendaFabMenuProps {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSelect: (type: FabMenuSelection) => void
}

const MENU_ITEMS: Array<{ type: FabMenuSelection; label: string; icon: React.ReactNode; bgClass: string }> = [
  {
    type: "CONSULTA",
    label: "Consulta",
    icon: <StethoscopeIcon className="w-4 h-4 text-blue-600" />,
    bgClass: "bg-blue-100",
  },
  {
    type: "GROUP_SESSION",
    label: "Sessão em Grupo",
    icon: <UsersRoundIcon className="w-4 h-4 text-purple-600" />,
    bgClass: "bg-purple-100",
  },
  {
    type: "TAREFA",
    label: "Tarefa",
    icon: <ClipboardListIcon className="w-4 h-4 text-amber-600" />,
    bgClass: "bg-amber-100",
  },
  {
    type: "LEMBRETE",
    label: "Lembrete",
    icon: <BellIcon className="w-4 h-4 text-sky-600" />,
    bgClass: "bg-sky-100",
  },
  {
    type: "NOTA",
    label: "Nota",
    icon: <StickyNoteIcon className="w-4 h-4 text-slate-600" />,
    bgClass: "bg-slate-100",
  },
  {
    type: "REUNIAO",
    label: "Reunião",
    icon: <UsersRoundIcon className="w-4 h-4 text-violet-600" />,
    bgClass: "bg-violet-100",
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
                className="flex items-center gap-3 bg-white rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
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
