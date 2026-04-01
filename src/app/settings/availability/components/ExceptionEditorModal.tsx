"use client"

import { createPortal } from "react-dom"
import { motion } from "motion/react"
import { X, ShieldAlert, CalendarPlus, Building2, User } from "lucide-react"
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

const spring = { type: "spring", stiffness: 400, damping: 30 } as const

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={spring}
        className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="max-w-md mx-auto px-5 py-6">
          {/* Handle + close */}
          <div className="flex items-center justify-between mb-5">
            <div className="w-8" />
            <div className="w-10 h-1 rounded-full bg-border" />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <h2 className="text-xl font-semibold text-foreground tracking-[-0.02em] mb-6">
            {editingException.id ? "Editar Exceção" : "Nova Exceção"}
          </h2>

          <div className="space-y-5">
            {/* Exception type */}
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-2.5">Tipo</label>
              <div className="grid grid-cols-2 gap-2.5">
                <OptionCard
                  active={!editingException.isAvailable}
                  onClick={() => onChange({ ...editingException, isAvailable: false })}
                  icon={<ShieldAlert size={16} strokeWidth={1.8} />}
                  label="Bloqueio"
                  color="red"
                />
                <OptionCard
                  active={editingException.isAvailable}
                  onClick={() => onChange({ ...editingException, isAvailable: true })}
                  icon={<CalendarPlus size={16} strokeWidth={1.8} />}
                  label="Extra"
                  color="emerald"
                />
              </div>
            </div>

            {/* Target (Admin only) */}
            {isAdmin && (
              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-2.5">Aplicar a</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <OptionCard
                    active={editingException.targetType === "clinic"}
                    onClick={() => onChange({ ...editingException, targetType: "clinic", targetProfessionalId: null })}
                    icon={<Building2 size={16} strokeWidth={1.8} />}
                    label="Clínica"
                    color="purple"
                  />
                  <OptionCard
                    active={editingException.targetType === "professional"}
                    onClick={() => onChange({ ...editingException, targetType: "professional", targetProfessionalId: selectedProfessionalId })}
                    icon={<User size={16} strokeWidth={1.8} />}
                    label="Profissional"
                    color="blue"
                  />
                </div>
                {editingException.targetType === "professional" && (
                  <select
                    value={editingException.targetProfessionalId || ""}
                    onChange={(e) => onChange({ ...editingException, targetProfessionalId: e.target.value || null })}
                    className="mt-2.5 w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  >
                    <option value="">Selecione...</option>
                    {professionals.map((prof) => (
                      <option key={prof.id} value={prof.id}>{prof.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Date */}
            <div>
              <label htmlFor="exceptionDate" className="block text-[13px] font-medium text-muted-foreground mb-2">Data</label>
              <input
                id="exceptionDate"
                type="text"
                placeholder="DD/MM/AAAA"
                value={editingException.date}
                onChange={(e) => onChange({ ...editingException, date: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>

            {/* Full day toggle */}
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <span className="text-sm text-foreground">Dia inteiro</span>
              <button
                type="button"
                onClick={() => onChange({
                  ...editingException,
                  isFullDay: !editingException.isFullDay,
                  startTime: !editingException.isFullDay ? null : "08:00",
                  endTime: !editingException.isFullDay ? null : "18:00",
                })}
                className={`relative w-11 h-[26px] rounded-full transition-colors duration-300 ${
                  editingException.isFullDay ? "bg-primary" : "bg-border"
                }`}
              >
                <motion.div
                  layout
                  className="absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm"
                  animate={{ x: editingException.isFullDay ? 18 : 0 }}
                  transition={spring}
                />
              </button>
            </div>

            {/* Time range */}
            {!editingException.isFullDay && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={editingException.startTime || ""}
                  onChange={(e) => onChange({ ...editingException, startTime: e.target.value })}
                  className="flex-1 h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                <span className="text-xs text-muted-foreground">&ndash;</span>
                <input
                  type="time"
                  value={editingException.endTime || ""}
                  onChange={(e) => onChange({ ...editingException, endTime: e.target.value })}
                  className="flex-1 h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            )}

            {/* Reason */}
            <div>
              <label htmlFor="exceptionReason" className="block text-[13px] font-medium text-muted-foreground mb-2">
                Motivo <span className="font-normal text-muted-foreground/60">(opcional)</span>
              </label>
              <input
                id="exceptionReason"
                type="text"
                value={editingException.reason || ""}
                onChange={(e) => onChange({ ...editingException, reason: e.target.value })}
                placeholder="Ex: Férias, Feriado"
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="flex-[2] h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  )
}

function OptionCard({ active, onClick, icon, label, color }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: "red" | "emerald" | "purple" | "blue"
}) {
  const colors = {
    red: active ? "border-red-500/40 bg-red-500/[0.06] text-red-600 dark:text-red-400" : "",
    emerald: active ? "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400" : "",
    purple: active ? "border-purple-500/40 bg-purple-500/[0.06] text-purple-600 dark:text-purple-400" : "",
    blue: active ? "border-blue-500/40 bg-blue-500/[0.06] text-blue-600 dark:text-blue-400" : "",
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-3 rounded-xl border text-sm font-medium transition-colors ${
        active ? colors[color] : "border-border text-muted-foreground hover:border-foreground/20"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
