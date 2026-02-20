"use client"

import { createPortal } from "react-dom"
import { EditingBlock, DAYS_OF_WEEK } from "./types"

interface TimeBlockEditorModalProps {
  editingBlock: EditingBlock
  isSaving: boolean
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  onChange: (editingBlock: EditingBlock) => void
}

export function TimeBlockEditorModal({
  editingBlock,
  isSaving,
  onSave,
  onDelete,
  onClose,
  onChange,
}: TimeBlockEditorModalProps) {
  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-8" />
            <div className="w-12 h-1.5 rounded-full bg-muted" />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-6">
            {editingBlock.index !== null
              ? "Editar Horário"
              : "Novo Horário"}
            {" - "}
            {DAYS_OF_WEEK[editingBlock.dayOfWeek].label}
          </h2>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="startTime"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Início
                </label>
                <input
                  id="startTime"
                  type="text"
                  placeholder="HH:mm"
                  value={editingBlock.block.startTime}
                  onChange={(e) =>
                    onChange({
                      ...editingBlock,
                      block: {
                        ...editingBlock.block,
                        startTime: e.target.value,
                      },
                    })
                  }
                  pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="endTime"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Término
                </label>
                <input
                  id="endTime"
                  type="text"
                  placeholder="HH:mm"
                  value={editingBlock.block.endTime}
                  onChange={(e) =>
                    onChange({
                      ...editingBlock,
                      block: {
                        ...editingBlock.block,
                        endTime: e.target.value,
                      },
                    })
                  }
                  pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...editingBlock,
                    block: {
                      ...editingBlock.block,
                      isActive: !editingBlock.block.isActive,
                    },
                  })
                }
                className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                  editingBlock.block.isActive ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    editingBlock.block.isActive ? "left-7" : "left-1"
                  }`}
                />
              </button>
              <span className="text-sm text-foreground">
                {editingBlock.block.isActive ? "Ativo" : "Inativo"}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="button"
                onClick={onSave}
                className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
              >
                Salvar
              </button>
              {editingBlock.index !== null && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-destructive text-destructive font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
