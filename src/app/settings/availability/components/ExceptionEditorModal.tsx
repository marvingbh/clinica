"use client"

import { createPortal } from "react-dom"
import { EditingException, Professional } from "./types"

interface ExceptionEditorModalProps {
  editingException: EditingException
  professionals: Professional[]
  selectedProfessionalId: string | null
  isAdmin: boolean
  isSaving: boolean
  onSave: () => void
  onClose: () => void
  onChange: (editingException: EditingException) => void
}

export function ExceptionEditorModal({
  editingException,
  professionals,
  selectedProfessionalId,
  isAdmin,
  isSaving,
  onSave,
  onClose,
  onChange,
}: ExceptionEditorModalProps) {
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
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-6">
            {editingException.id ? "Editar Exceção" : "Nova Exceção"}
          </h2>

          <div className="space-y-6">
            {/* Exception Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Tipo
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...editingException,
                      isAvailable: false,
                    })
                  }
                  className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                    !editingException.isAvailable
                      ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  Bloqueio
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...editingException,
                      isAvailable: true,
                    })
                  }
                  className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                    editingException.isAvailable
                      ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  Disponibilidade Extra
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {editingException.isAvailable
                  ? "Adiciona disponibilidade fora do horário normal"
                  : "Bloqueia a agenda para este período"}
              </p>
            </div>

            {/* Target (Admin only) */}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Aplicar a
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...editingException,
                        targetType: "clinic",
                        targetProfessionalId: null,
                      })
                    }
                    className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                      editingException.targetType === "clinic"
                        ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                        : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    Toda a clínica
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...editingException,
                        targetType: "professional",
                        targetProfessionalId: selectedProfessionalId,
                      })
                    }
                    className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                      editingException.targetType === "professional"
                        ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    Profissional específico
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {editingException.targetType === "clinic"
                    ? "Afeta todos os profissionais da clínica (ex: feriado)"
                    : "Afeta apenas o profissional selecionado"}
                </p>

                {/* Professional selector when targeting specific professional */}
                {editingException.targetType === "professional" && (
                  <div className="mt-3">
                    <select
                      value={editingException.targetProfessionalId || ""}
                      onChange={(e) =>
                        onChange({
                          ...editingException,
                          targetProfessionalId: e.target.value || null,
                        })
                      }
                      className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    >
                      <option value="">Selecione um profissional</option>
                      {professionals.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Date */}
            <div>
              <label
                htmlFor="exceptionDate"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Data
              </label>
              <input
                id="exceptionDate"
                type="text"
                placeholder="DD/MM/AAAA"
                value={editingException.date}
                onChange={(e) =>
                  onChange({
                    ...editingException,
                    date: e.target.value,
                  })
                }
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Formato: DD/MM/AAAA</p>
            </div>

            {/* Full Day Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...editingException,
                    isFullDay: !editingException.isFullDay,
                    startTime: !editingException.isFullDay ? null : "08:00",
                    endTime: !editingException.isFullDay ? null : "18:00",
                  })
                }
                className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                  editingException.isFullDay ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    editingException.isFullDay ? "left-7" : "left-1"
                  }`}
                />
              </button>
              <span className="text-sm text-foreground">Dia inteiro</span>
            </div>

            {/* Time Range (only if not full day) */}
            {!editingException.isFullDay && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="exceptionStartTime"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Início
                  </label>
                  <input
                    id="exceptionStartTime"
                    type="text"
                    placeholder="HH:mm"
                    value={editingException.startTime || ""}
                    onChange={(e) =>
                      onChange({
                        ...editingException,
                        startTime: e.target.value,
                      })
                    }
                    pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="exceptionEndTime"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Término
                  </label>
                  <input
                    id="exceptionEndTime"
                    type="text"
                    placeholder="HH:mm"
                    value={editingException.endTime || ""}
                    onChange={(e) =>
                      onChange({
                        ...editingException,
                        endTime: e.target.value,
                      })
                    }
                    pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label
                htmlFor="exceptionReason"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Motivo (opcional)
              </label>
              <input
                id="exceptionReason"
                type="text"
                value={editingException.reason || ""}
                onChange={(e) =>
                  onChange({
                    ...editingException,
                    reason: e.target.value,
                  })
                }
                placeholder="Ex: Férias, Feriado, Compromisso pessoal"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
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
