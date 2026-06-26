/**
 * Appointment entry-type helpers (framework-agnostic).
 *
 * The five appointment types and their calendar behavior live here so the
 * rule isn't duplicated across the create route, the extend-recurrences cron,
 * and anywhere else that materializes appointments.
 */

export type AppointmentEntryType =
  | "CONSULTA"
  | "TAREFA"
  | "LEMBRETE"
  | "NOTA"
  | "REUNIAO"

/**
 * Whether an entry type occupies (blocks) the calendar slot.
 *
 * CONSULTA, TAREFA and REUNIAO block time; LEMBRETE and NOTA are lightweight
 * chips that don't reserve the slot.
 */
export function blocksTimeForType(type: AppointmentEntryType): boolean {
  return type === "CONSULTA" || type === "TAREFA" || type === "REUNIAO"
}
