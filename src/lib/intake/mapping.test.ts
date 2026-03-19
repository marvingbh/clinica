import { describe, it, expect, vi } from "vitest"
import { mapSubmissionToPatient } from "./mapping"
import type { IntakeSubmission } from "@prisma/client"

const baseSubmission: IntakeSubmission = {
  id: "sub_1",
  clinicId: "clinic_1",
  status: "PENDING",
  childName: "Maria Silva",
  childBirthDate: new Date("2018-05-15"),
  guardianName: "Ana Silva",
  guardianCpfCnpj: "52998224725",
  phone: "11999887766",
  email: "ana@example.com",
  addressStreet: "Rua das Flores",
  addressNumber: "123",
  addressNeighborhood: "Centro",
  addressCity: "Sao Paulo",
  addressState: "SP",
  addressZip: "01234567",
  schoolName: "Escola Alegria",
  schoolUnit: "Unidade Norte",
  schoolShift: "Manha",
  motherName: "Ana Silva",
  motherPhone: "11999887766",
  fatherName: "Carlos Silva",
  fatherPhone: "11988776655",
  consentPhotoVideo: true,
  consentSessionRecording: false,
  patientId: null,
  reviewedByUserId: null,
  reviewedAt: null,
  ipAddress: "127.0.0.1",
  submittedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("mapSubmissionToPatient", () => {
  it("maps child info to patient name and birth date", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.name).toBe("Maria Silva")
    expect(result.birthDate).toEqual(new Date("2018-05-15"))
  })

  it("maps guardian info to billingCpf only (not cpf, to allow siblings)", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.billingResponsibleName).toBe("Ana Silva")
    expect(result.billingCpf).toBe("52998224725")
    expect(result).not.toHaveProperty("cpf")
  })

  it("maps contact info", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.phone).toBe("11999887766")
    expect(result.email).toBe("ana@example.com")
  })

  it("maps address fields", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.addressStreet).toBe("Rua das Flores")
    expect(result.addressNumber).toBe("123")
    expect(result.addressCity).toBe("Sao Paulo")
    expect(result.addressState).toBe("SP")
    expect(result.addressZip).toBe("01234567")
  })

  it("maps school fields", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.schoolName).toBe("Escola Alegria")
    expect(result.schoolUnit).toBe("Unidade Norte")
    expect(result.schoolShift).toBe("Manha")
  })

  it("maps parent fields", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.motherName).toBe("Ana Silva")
    expect(result.motherPhone).toBe("11999887766")
    expect(result.fatherName).toBe("Carlos Silva")
    expect(result.fatherPhone).toBe("11988776655")
  })

  it("sets consent timestamp when consent is true", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"))

    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.consentPhotoVideo).toBe(true)
    expect(result.consentPhotoVideoAt).toEqual(new Date("2026-03-19T12:00:00Z"))

    vi.useRealTimers()
  })

  it("does not set consent timestamp when consent is false", () => {
    const result = mapSubmissionToPatient(baseSubmission, "clinic_1")
    expect(result.consentSessionRecording).toBe(false)
    expect(result.consentSessionRecordingAt).toBeUndefined()
  })

  it("uses provided clinicId", () => {
    const result = mapSubmissionToPatient(baseSubmission, "different_clinic")
    expect(result.clinicId).toBe("different_clinic")
  })

  it("converts empty strings to undefined for optional fields", () => {
    const submission = {
      ...baseSubmission,
      schoolName: "",
      motherName: "",
      fatherPhone: "",
    }
    const result = mapSubmissionToPatient(submission, "clinic_1")
    expect(result.schoolName).toBeUndefined()
    expect(result.motherName).toBeUndefined()
    expect(result.fatherPhone).toBeUndefined()
  })
})
