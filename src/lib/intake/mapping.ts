import type { IntakeSubmission } from "@prisma/client"

/**
 * Maps an IntakeSubmission to Patient creation data.
 * All fields are mapped per the plan's field mapping specification.
 */
export function mapSubmissionToPatient(submission: IntakeSubmission, clinicId: string) {
  const now = new Date()

  return {
    clinicId,
    name: submission.childName,
    birthDate: submission.childBirthDate,
    phone: submission.phone,
    email: submission.email || undefined,
    cpf: submission.guardianCpfCnpj,
    billingCpf: submission.guardianCpfCnpj,
    billingResponsibleName: submission.guardianName,
    addressStreet: submission.addressStreet || undefined,
    addressNumber: submission.addressNumber || undefined,
    addressNeighborhood: submission.addressNeighborhood || undefined,
    addressCity: submission.addressCity || undefined,
    addressState: submission.addressState || undefined,
    addressZip: submission.addressZip || undefined,
    schoolName: submission.schoolName || undefined,
    schoolUnit: submission.schoolUnit || undefined,
    schoolShift: submission.schoolShift || undefined,
    motherName: submission.motherName || undefined,
    motherPhone: submission.motherPhone || undefined,
    fatherName: submission.fatherName || undefined,
    fatherPhone: submission.fatherPhone || undefined,
    consentPhotoVideo: submission.consentPhotoVideo,
    consentPhotoVideoAt: submission.consentPhotoVideo ? now : undefined,
    consentSessionRecording: submission.consentSessionRecording,
    consentSessionRecordingAt: submission.consentSessionRecording ? now : undefined,
  }
}
