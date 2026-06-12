"use client"

import { TimeInput } from "@/app/agenda/components/TimeInput"
import { XIcon, PlusIcon } from "@/shared/components/ui/icons"
import type { WaitlistPreferences } from "@/lib/waitlist"

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
]

interface Props {
  value: WaitlistPreferences
  onChange: (next: WaitlistPreferences) => void
}

/** Weekday chips + time-range list (masked HH:mm) + modality selector. */
export function PreferencesFields({ value, onChange }: Props) {
  function toggleWeekday(day: number) {
    const has = value.weekdays.includes(day)
    onChange({
      ...value,
      weekdays: has ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day].sort(),
    })
  }

  function setRange(index: number, field: "start" | "end", v: string) {
    const next = value.timeRanges.map((r, i) => (i === index ? { ...r, [field]: v } : r))
    onChange({ ...value, timeRanges: next })
  }

  function addRange() {
    onChange({ ...value, timeRanges: [...value.timeRanges, { start: "", end: "" }] })
  }

  function removeRange(index: number) {
    onChange({ ...value, timeRanges: value.timeRanges.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
          Dias da semana
        </label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const active = value.weekdays.includes(d.value)
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className={`px-3 py-1.5 rounded-md text-[13px] border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-ink-700 border-ink-300 hover:border-ink-400"
                }`}
              >
                {d.label}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-ink-500 mt-1">Vazio = qualquer dia.</p>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
          Faixas de horário
        </label>
        <div className="space-y-2">
          {value.timeRanges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <TimeInput
                value={r.start}
                onChange={(e) => setRange(i, "start", e.target.value)}
                placeholder="18:00"
                className="w-24 h-10 px-2 rounded-md border border-ink-300 text-[13px] text-center"
              />
              <span className="text-ink-500">–</span>
              <TimeInput
                value={r.end}
                onChange={(e) => setRange(i, "end", e.target.value)}
                placeholder="21:00"
                className="w-24 h-10 px-2 rounded-md border border-ink-300 text-[13px] text-center"
              />
              <button
                type="button"
                onClick={() => removeRange(i)}
                className="w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 flex items-center justify-center"
                aria-label="Remover faixa"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRange}
            className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
          >
            <PlusIcon className="w-4 h-4" /> Adicionar faixa
          </button>
        </div>
        <p className="text-[11px] text-ink-500 mt-1">Vazio = qualquer horário.</p>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Modalidade</label>
        <select
          value={value.modality ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              modality: e.target.value === "" ? null : (e.target.value as "ONLINE" | "PRESENCIAL"),
            })
          }
          className="w-full h-10 px-2 rounded-md border border-ink-300 bg-card text-[13px]"
        >
          <option value="">Qualquer</option>
          <option value="ONLINE">Online</option>
          <option value="PRESENCIAL">Presencial</option>
        </select>
      </div>
    </div>
  )
}
