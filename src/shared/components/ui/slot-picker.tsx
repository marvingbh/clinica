"use client"

import { motion, AnimatePresence, LayoutGroup } from "motion/react"
import { Plus, Trash2 } from "lucide-react"

export interface TimeSlot {
  id: string
  from: string
  to: string
}

export interface DayData {
  id: string
  label: string
  shortLabel?: string
  enabled: boolean
  slots: TimeSlot[]
}

interface SlotPickerProps {
  days: DayData[]
  onUpdate: (days: DayData[]) => void
  defaultFrom?: string
  defaultTo?: string
}

const spring = { type: "spring", stiffness: 500, damping: 30, mass: 1 } as const

export function SlotPicker({ days, onUpdate, defaultFrom = "08:00", defaultTo = "18:00" }: SlotPickerProps) {
  const updateSlotValue = (dayId: string, slotId: string, field: "from" | "to", value: string) => {
    onUpdate(days.map((d) => (d.id === dayId ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, [field]: value } : s)) } : d)))
  }

  const toggleDay = (id: string) => {
    onUpdate(
      days.map((d) => {
        if (d.id !== id) return d
        const enabled = !d.enabled
        return { ...d, enabled, slots: enabled && d.slots.length === 0 ? [{ id: crypto.randomUUID(), from: defaultFrom, to: defaultTo }] : d.slots }
      })
    )
  }

  const addSlot = (dayId: string) => {
    onUpdate(days.map((d) => (d.id === dayId ? { ...d, slots: [...d.slots, { id: crypto.randomUUID(), from: defaultFrom, to: defaultTo }] } : d)))
  }

  const removeSlot = (dayId: string, slotId: string) => {
    onUpdate(
      days.map((d) => {
        if (d.id !== dayId) return d
        const slots = d.slots.filter((s) => s.id !== slotId)
        return { ...d, slots, enabled: slots.length > 0 }
      })
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      <LayoutGroup>
        {days.map((day) => (
          <motion.div
            layout
            key={day.id}
            initial={false}
            transition={spring}
            className={`overflow-hidden rounded-2xl transition-colors duration-300 border ${
              day.enabled ? "bg-card border-border/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" : "bg-muted/50 border-transparent"
            }`}
          >
            <motion.div layout transition={spring} className="flex items-center justify-between px-4 sm:px-5 h-[52px]">
              <span
                className={`text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-300 ${
                  day.enabled ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="hidden sm:inline">{day.label}</span>
                <span className="sm:hidden">{day.shortLabel || day.label}</span>
              </span>
              <button
                type="button"
                title="Alternar dia"
                onClick={() => toggleDay(day.id)}
                className={`relative w-11 h-[26px] rounded-full transition-colors duration-300 ${
                  day.enabled ? "bg-primary" : "bg-border"
                }`}
              >
                <motion.div
                  layout
                  className="absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm"
                  animate={{ x: day.enabled ? 18 : 0 }}
                  transition={spring}
                />
              </button>
            </motion.div>

            <AnimatePresence>
              {day.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring}
                >
                  <div className="px-4 sm:px-5 pb-4 flex flex-col gap-2.5">
                    <AnimatePresence mode="popLayout">
                      {day.slots.map((slot) => (
                        <motion.div
                          key={slot.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -8 }}
                          transition={spring}
                          className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2"
                        >
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              type="time"
                              value={slot.from}
                              onChange={(e) => updateSlotValue(day.id, slot.id, "from", e.target.value)}
                              aria-label="Início"
                              className="w-full max-w-[120px] border border-border/60 rounded-lg px-2.5 py-1.5 text-sm font-medium bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                            />
                            <span className="text-xs text-muted-foreground shrink-0 px-1">&ndash;</span>
                            <input
                              type="time"
                              value={slot.to}
                              onChange={(e) => updateSlotValue(day.id, slot.id, "to", e.target.value)}
                              aria-label="Término"
                              className="w-full max-w-[120px] border border-border/60 rounded-lg px-2.5 py-1.5 text-sm font-medium bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            title="Remover horário"
                            onClick={() => removeSlot(day.id, slot.id)}
                            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={15} strokeWidth={1.8} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <motion.button
                      type="button"
                      layout
                      transition={spring}
                      onClick={() => addSlot(day.id)}
                      className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-dashed border-border/80 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors"
                    >
                      <Plus size={14} strokeWidth={2.5} />
                      Adicionar horário
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </LayoutGroup>
    </div>
  )
}
