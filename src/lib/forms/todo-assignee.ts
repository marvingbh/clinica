/**
 * Resolves who receives the "Formulário respondido" Todo when a response is
 * completed. Preference: the patient's reference professional, then the
 * professional recorded on the send, then none (no Todo created).
 */
export function resolveTodoAssignee(input: {
  patientReferenceProfessionalId: string | null
  responseProfessionalProfileId: string | null
}): string | null {
  return (
    input.patientReferenceProfessionalId ??
    input.responseProfessionalProfileId ??
    null
  )
}
