/**
 * True when the patient is under 18 at `now`. A null birthDate is treated as
 * an adult (we don't show guardian framing without evidence of a minor).
 */
export function isMinor(birthDate: Date | null, now: Date): boolean {
  if (!birthDate) return false
  const eighteenth = new Date(birthDate)
  eighteenth.setFullYear(eighteenth.getFullYear() + 18)
  return now.getTime() < eighteenth.getTime()
}

/**
 * Display name shown in the portal profile switcher. Minors are framed as
 * "Responsável por {nome}" since the logged-in contact is the guardian.
 */
export function portalDisplayName(
  patient: { name: string; birthDate: Date | null },
  now: Date,
): string {
  return isMinor(patient.birthDate, now) ? `Responsável por ${patient.name}` : patient.name
}
