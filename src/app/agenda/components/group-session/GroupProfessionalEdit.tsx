"use client"

import { useState } from "react"
import { updateAppointment } from "../../services/appointmentService"
import { toast } from "sonner"
import type { GroupSession, Professional } from "./types"

interface GroupProfessionalEditProps {
  session: GroupSession
  professionals: Professional[]
  onStatusUpdated: () => void
}

export function GroupProfessionalEdit({
  session,
  professionals,
  onStatusUpdated,
}: GroupProfessionalEditProps) {
  const [sessionProfIds, setSessionProfIds] = useState<string[]>(
    () => session.additionalProfessionals?.map(ap => ap.professionalProfileId) || []
  )
  const [isSavingProfs, setIsSavingProfs] = useState(false)
  const [isEditingProfs, setIsEditingProfs] = useState(false)

  const handleSave = async () => {
    setIsSavingProfs(true)
    try {
      const results = await Promise.all(
        session.participants.map(p =>
          updateAppointment(p.appointmentId, { additionalProfessionalIds: sessionProfIds })
        )
      )
      const hasError = results.find(r => r.error)
      if (hasError) { toast.error(hasError.error) }
      else { toast.success("Profissionais da sessão atualizados"); setIsEditingProfs(false); onStatusUpdated() }
    } catch {
      toast.error("Erro ao atualizar profissionais")
    } finally {
      setIsSavingProfs(false)
    }
  }

  const eligibleProfs = professionals.filter(
    p => p.professionalProfile?.id && p.professionalProfile.id !== session.professionalProfileId
  )

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Profissionais adicionais</h3>
        {!isEditingProfs ? (
          <button type="button" onClick={() => setIsEditingProfs(true)} className="text-xs text-primary hover:underline">Editar</button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={handleSave} disabled={isSavingProfs} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {isSavingProfs ? "..." : "Salvar"}
            </button>
            <button type="button" onClick={() => { setSessionProfIds(session.additionalProfessionals?.map(ap => ap.professionalProfileId) || []); setIsEditingProfs(false) }} className="text-xs text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
          </div>
        )}
      </div>

      {isEditingProfs ? (
        <div className="space-y-2 p-2 rounded-lg border border-input bg-background">
          {eligibleProfs.map(prof => (
            <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sessionProfIds.includes(prof.professionalProfile!.id)}
                onChange={() => {
                  const profId = prof.professionalProfile!.id
                  setSessionProfIds(prev => prev.includes(profId) ? prev.filter(id => id !== profId) : [...prev, profId])
                }}
                className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
              />
              <span className="text-sm">{prof.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {session.additionalProfessionals && session.additionalProfessionals.length > 0 ? (
            session.additionalProfessionals.map(ap => (
              <span key={ap.professionalProfileId} className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                {ap.professionalName}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Nenhum</span>
          )}
        </div>
      )}
    </div>
  )
}
