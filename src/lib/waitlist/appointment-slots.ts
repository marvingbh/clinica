import { handleSlotsOpened, type SlotOpenTrigger } from "./slot-opened"
import type { OpenSlot } from "./types"

/** Minimal appointment shape needed to derive an OpenSlot. */
export interface SlotSourceAppointment {
  id: string
  type: string
  blocksTime: boolean
  scheduledAt: Date
  endAt: Date
  modality: "ONLINE" | "PRESENCIAL" | null
  professionalProfileId: string
}

/**
 * Filters appointment rows to the ones that should trigger the waitlist
 * (future, time-blocking CONSULTA) and maps them to OpenSlots.
 */
export function toOpenSlots(appointments: SlotSourceAppointment[], now: Date): OpenSlot[] {
  return appointments
    .filter(
      (a) =>
        a.type === "CONSULTA" &&
        a.blocksTime &&
        a.scheduledAt.getTime() > now.getTime()
    )
    .map((a) => ({
      professionalProfileId: a.professionalProfileId,
      scheduledAt: a.scheduledAt,
      endAt: a.endAt,
      modality: a.modality,
      sourceAppointmentId: a.id,
    }))
}

/**
 * Fire-and-forget waitlist hook for cancellation adapters. Never throws —
 * a failure here must not break the originating operation.
 */
export async function notifyWaitlistSlotsOpened(input: {
  clinicId: string
  appointments: SlotSourceAppointment[]
  trigger: SlotOpenTrigger
}): Promise<void> {
  try {
    const slots = toOpenSlots(input.appointments, new Date())
    if (slots.length === 0) return
    await handleSlotsOpened({ clinicId: input.clinicId, slots, trigger: input.trigger })
  } catch (err) {
    console.error("[waitlist] handleSlotsOpened failed:", err)
  }
}
