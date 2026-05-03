"use client"

import {
  CheckIcon,
  XIcon,
  BanIcon,
  AlertCircleIcon,
} from "@/shared/components/ui/icons"
import { STATUS_LABELS } from "@/lib/appointments/status-transitions"
import type { PendingAppointment, SortKey, SortState } from "../types"

interface Props {
  rows: PendingAppointment[]
  selected: Set<string>
  busyIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAllVisible: () => void
  onFinalize: (a: PendingAppointment) => void
  onMarkNoShow: (a: PendingAppointment) => void
  onCancel: (a: PendingAppointment) => void
  sort: SortState
  onSort: (key: SortKey) => void
  rounded?: "full" | "bottom" | "top" | "middle"
}

const dowLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]

function fmtDay(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
function dowFor(iso: string) {
  return dowLabels[new Date(iso).getDay()]
}
function daysAgo(iso: string, now: Date = new Date()) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400_000)
}

const STATUS_COLOR: Record<string, string> = {
  AGENDADO: "bg-warn-50 text-warn-700",
  CONFIRMADO: "bg-brand-50 text-brand-700",
  FINALIZADO: "bg-ok-50 text-ok-700",
  CANCELADO_FALTA: "bg-err-50 text-err-700",
  CANCELADO_ACORDADO: "bg-violet-50 text-violet-700",
  CANCELADO_PROFISSIONAL: "bg-ink-100 text-ink-700",
}

export function PendenciasTable({
  rows,
  selected,
  busyIds,
  onToggleSelect,
  onSelectAllVisible,
  onFinalize,
  onMarkNoShow,
  onCancel,
  sort,
  onSort,
  rounded = "full",
}: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? "↑" : "↓") : "↕")

  const roundedClass =
    rounded === "full"
      ? "rounded-[12px]"
      : rounded === "top"
        ? "rounded-t-[12px]"
        : rounded === "bottom"
          ? "rounded-b-[12px]"
          : ""

  if (rows.length === 0) {
    return (
      <div className={`text-center py-14 px-4 bg-card border border-ink-200 ${roundedClass}`}>
        <div className="text-[16px] font-semibold text-ink-700">
          Nenhuma pendência encontrada
        </div>
        <div className="text-[12px] text-ink-500 mt-1">
          Tudo finalizado por aqui — ou ajuste os filtros para ver mais.
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-card border border-ink-200 overflow-x-auto ${roundedClass}`}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-ink-50/40 border-b border-ink-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
            <th className="w-10 px-3.5 py-2.5 text-left">
              <Check checked={allChecked} onClick={onSelectAllVisible} />
            </th>
            <ThSort label="Data / hora" k="date" sort={sort} arrow={arrow} onSort={onSort} />
            <ThSort label="Paciente" k="patient" sort={sort} arrow={arrow} onSort={onSort} />
            <ThSort label="Profissional" k="professional" sort={sort} arrow={arrow} onSort={onSort} />
            <ThSort label="Status" k="status" sort={sort} arrow={arrow} onSort={onSort} />
            <th className="px-3.5 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const days = daysAgo(r.scheduledAt)
            const veryStale = days >= 30
            const stale = days >= 7 && days < 30
            const busy = busyIds.has(r.id)
            return (
              <tr
                key={r.id}
                className={`border-b border-ink-100 last:border-b-0 hover:bg-ink-50/40 ${busy ? "opacity-50" : ""}`}
              >
                <td className="px-3.5 py-3">
                  <Check
                    checked={selected.has(r.id)}
                    onClick={() => onToggleSelect(r.id)}
                  />
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap tabular-nums">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-ink-500">
                    {dowFor(r.scheduledAt)}
                  </div>
                  <div className="text-ink-900">
                    {fmtDay(r.scheduledAt)} · {fmtTime(r.scheduledAt)}
                  </div>
                  <div
                    className={`text-[10.5px] mt-0.5 ${
                      veryStale ? "text-err-700 font-semibold" : stale ? "text-warn-700" : "text-ink-500"
                    }`}
                  >
                    {veryStale && <AlertCircleIcon className="inline w-2.5 h-2.5 mr-0.5 -mt-px" />}
                    há {days} dia{days === 1 ? "" : "s"}
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <div className="text-[13px] font-semibold text-ink-900">
                    {r.patient?.name ?? r.title ?? "—"}
                  </div>
                  {r.patient?.phone && (
                    <div className="text-[11.5px] text-ink-500 mt-0.5 tabular-nums">
                      {r.patient.phone}
                    </div>
                  )}
                </td>
                <td className="px-3.5 py-3">
                  <div className="inline-flex items-center gap-1.5 text-[13px]">
                    <span className="w-2 h-2 rounded-full bg-brand-500" />
                    {r.professionalProfile.user.name.split(" ")[0]}
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[r.status] ?? "bg-ink-100 text-ink-700"}`}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-3.5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <ActionBtn
                      onClick={() => onFinalize(r)}
                      busy={busy}
                      title="Finalizar"
                      tone="ok"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Finalizar</span>
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => onMarkNoShow(r)}
                      busy={busy}
                      title="Marcar como falta"
                      tone="warn"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Faltou</span>
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => onCancel(r)}
                      busy={busy}
                      title="Cancelar"
                      tone="danger"
                    >
                      <BanIcon className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Cancelar</span>
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ThSort({
  label,
  k,
  sort,
  arrow,
  onSort,
}: {
  label: string
  k: SortKey
  sort: SortState
  arrow: (k: SortKey) => string
  onSort: (k: SortKey) => void
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3.5 py-2.5 text-left cursor-pointer select-none whitespace-nowrap ${
        sort.key === k ? "text-ink-800" : ""
      }`}
    >
      {label}{" "}
      <span
        className={`ml-1 ${sort.key === k ? "text-brand-600 opacity-100" : "text-ink-400 opacity-40"}`}
      >
        {arrow(k)}
      </span>
    </th>
  )
}

function Check({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-4 h-4 rounded border grid place-items-center transition-colors ${
        checked
          ? "bg-ok-500 border-ok-500 text-white"
          : "border-ink-300 bg-white hover:border-ink-500"
      }`}
    >
      {checked && <CheckIcon className="w-2.5 h-2.5" strokeWidth={3} />}
    </button>
  )
}

function ActionBtn({
  onClick,
  busy,
  title,
  tone,
  children,
}: {
  onClick: () => void
  busy: boolean
  title: string
  tone: "ok" | "warn" | "danger"
  children: React.ReactNode
}) {
  const toneClass =
    tone === "ok"
      ? "border-ok-200 text-ok-700 hover:bg-ok-50"
      : tone === "warn"
        ? "border-warn-200 text-warn-700 hover:bg-warn-50"
        : "border-err-200 text-err-700 hover:bg-err-50"
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-[6px] border bg-card text-[11.5px] font-medium disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  )
}
