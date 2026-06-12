/**
 * Classifies a phone-number lookup result into a match outcome.
 *
 * Auto-confirmation is only safe when a phone maps to exactly one patient.
 * Two distinct patients sharing a phone (e.g. a parent responsible for two
 * children) is ambiguous and must fall back to a manual approval.
 */
export type PhoneMatch =
  | { kind: "none" }
  | { kind: "unique"; patientId: string }
  | { kind: "ambiguous"; patientIds: string[] }

/**
 * @param candidatePatientIds patient ids found via Patient.phone ∪ PatientPhone.phone
 *        (may contain duplicates; they are de-duplicated here).
 */
export function classifyPhoneMatch(candidatePatientIds: string[]): PhoneMatch {
  const distinct = Array.from(new Set(candidatePatientIds))
  if (distinct.length === 0) return { kind: "none" }
  if (distinct.length === 1) return { kind: "unique", patientId: distinct[0] }
  return { kind: "ambiguous", patientIds: distinct }
}
