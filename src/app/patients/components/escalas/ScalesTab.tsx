"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { toast } from "sonner"
import { Loader2, Send, ClipboardList, CalendarClock, FileDown } from "lucide-react"
import { isScaleCode, type ScaleCode } from "@/lib/scales"
import { TrajectoryChart } from "./TrajectoryChart"
import { AdministrationsTable } from "./AdministrationsTable"
import { SendScaleDialog } from "./SendScaleDialog"
import { InSessionFillDialog } from "./InSessionFillDialog"
import { ScheduleDialog } from "./ScheduleDialog"
import { SchedulesList } from "./SchedulesList"
import { ScaleMetadataList } from "./ScaleMetadataList"
import type { AdministrationRow, ScheduleRow, ScaleOption, MetadataRow } from "./types"

interface Props {
  patientId: string
  patientName: string
  birthDate: string | null
  canReadContent: boolean
  canWrite: boolean
  hasWhatsAppConsent: boolean
  hasEmailConsent: boolean
}

type Dialog = "send" | "session" | "schedule" | null

export function ScalesTab({
  patientId,
  birthDate,
  canReadContent,
  canWrite,
  hasWhatsAppConsent,
  hasEmailConsent,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [administrations, setAdministrations] = useState<AdministrationRow[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [scales, setScales] = useState<ScaleOption[]>([])
  const [metadata, setMetadata] = useState<MetadataRow[]>([])
  const [selectedScale, setSelectedScale] = useState<ScaleCode | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  async function loadContent() {
    setLoading(true)
    const res = await fetch(`/api/patients/${patientId}/escalas`)
    if (res.status === 403) {
      setForbidden(true)
      setLoading(false)
      return
    }
    if (!res.ok) {
      toast.error("Não foi possível carregar as escalas.")
      setLoading(false)
      return
    }
    const data = await res.json()
    setAdministrations(data.administrations ?? [])
    setSchedules(data.schedules ?? [])
    setScales(data.scales ?? [])
    const codes = (data.administrations ?? [])
      .map((a: AdministrationRow) => a.scaleCode)
      .filter(isScaleCode)
    setSelectedScale((codes[0] as ScaleCode) ?? "PHQ9")
    setLoading(false)
  }

  async function loadMetadata() {
    setLoading(true)
    const res = await fetch(`/api/patients/${patientId}/escalas/metadata`)
    if (res.ok) {
      const data = await res.json()
      setMetadata(data.administrations ?? [])
    }
    setLoading(false)
  }

  useMountEffect(() => {
    if (canReadContent) loadContent()
    else loadMetadata()
  })

  async function resend(administrationId: string) {
    const channel = hasEmailConsent ? "EMAIL" : "WHATSAPP"
    const res = await fetch(`/api/escalas/administracoes/${administrationId}/reenviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error ?? "Não foi possível reenviar.")
      return
    }
    toast.success("Link reenviado.")
    await loadContent()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    )
  }

  // ADMIN-NONE view (or content access denied): metadata only.
  if (!canReadContent || forbidden) {
    return <ScaleMetadataList rows={metadata} />
  }

  const isMinor = isMinorFromBirthDate(birthDate)
  const distinctCodes = [...new Set(administrations.map((a) => a.scaleCode).filter(isScaleCode))] as ScaleCode[]
  const chartScale = selectedScale ?? distinctCodes[0] ?? "PHQ9"

  return (
    <div className="space-y-6">
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={<Send className="h-4 w-4" />} label="Enviar escala" onClick={() => setDialog("send")} />
          <ActionButton
            icon={<ClipboardList className="h-4 w-4" />}
            label="Aplicar em sessão"
            onClick={() => setDialog("session")}
          />
          <ActionButton
            icon={<CalendarClock className="h-4 w-4" />}
            label="Agendar envios"
            onClick={() => setDialog("schedule")}
          />
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Trajetória</h4>
          <div className="flex items-center gap-2">
            {distinctCodes.length > 1 && (
              <select
                value={chartScale}
                onChange={(e) => setSelectedScale(e.target.value as ScaleCode)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs"
              >
                {distinctCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <a
              href={`/api/patients/${patientId}/escalas/pdf?scaleCode=${chartScale}`}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <FileDown className="h-3 w-3" /> PDF
            </a>
          </div>
        </div>
        <TrajectoryChart administrations={administrations} scaleCode={chartScale} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">Administrações</h4>
        <AdministrationsTable administrations={administrations} canWrite={canWrite} onResend={resend} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">Envios automáticos</h4>
        <SchedulesList
          patientId={patientId}
          schedules={schedules}
          canWrite={canWrite}
          onChanged={loadContent}
        />
      </section>

      {dialog === "send" && (
        <SendScaleDialog
          patientId={patientId}
          scales={scales}
          isMinor={isMinor}
          hasWhatsAppConsent={hasWhatsAppConsent}
          hasEmailConsent={hasEmailConsent}
          onClose={() => setDialog(null)}
          onSent={loadContent}
        />
      )}
      {dialog === "session" && (
        <InSessionFillDialog
          patientId={patientId}
          scales={scales}
          onClose={() => setDialog(null)}
          onSaved={loadContent}
        />
      )}
      {dialog === "schedule" && (
        <ScheduleDialog
          patientId={patientId}
          scales={scales}
          onClose={() => setDialog(null)}
          onCreated={loadContent}
        />
      )}
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {icon}
      {label}
    </button>
  )
}

/** Derives whether the patient is under 18 from an ISO birth date string. */
function isMinorFromBirthDate(birthDate: string | null): boolean {
  if (!birthDate) return false
  const d = new Date(birthDate)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age < 18
}
