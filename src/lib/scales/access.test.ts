import { describe, it, expect } from "vitest"
import { canViewScaleContent, canManageScales, type ScaleAccessInput } from "./access"

function input(over: Partial<ScaleAccessInput> = {}): ScaleAccessInput {
  return {
    viewerRole: "PROFESSIONAL",
    viewerEscalasAccess: "WRITE",
    viewerProfessionalProfileId: "prof1",
    patientReferenceProfessionalId: "prof1",
    viewerHasAppointmentWithPatient: false,
    ...over,
  }
}

describe("canViewScaleContent", () => {
  it("ADMIN with NONE cannot view", () => {
    expect(
      canViewScaleContent(input({ viewerRole: "ADMIN", viewerEscalasAccess: "NONE" }))
    ).toBe(false)
  })

  it("ADMIN with READ override can view (clinical director)", () => {
    expect(
      canViewScaleContent(
        input({
          viewerRole: "ADMIN",
          viewerEscalasAccess: "READ",
          viewerProfessionalProfileId: null,
          patientReferenceProfessionalId: "someoneElse",
        })
      )
    ).toBe(true)
  })

  it("PROFESSIONAL who is the reference professional can view", () => {
    expect(
      canViewScaleContent(
        input({ patientReferenceProfessionalId: "prof1", viewerProfessionalProfileId: "prof1" })
      )
    ).toBe(true)
  })

  it("PROFESSIONAL with an appointment (but not reference) can view", () => {
    expect(
      canViewScaleContent(
        input({
          patientReferenceProfessionalId: "other",
          viewerHasAppointmentWithPatient: true,
        })
      )
    ).toBe(true)
  })

  it("PROFESSIONAL who neither references nor has an appointment cannot view", () => {
    expect(
      canViewScaleContent(
        input({
          patientReferenceProfessionalId: "other",
          viewerHasAppointmentWithPatient: false,
        })
      )
    ).toBe(false)
  })

  it("PROFESSIONAL with NONE cannot view even if treating", () => {
    expect(canViewScaleContent(input({ viewerEscalasAccess: "NONE" }))).toBe(false)
  })

  it("PROFESSIONAL with no profile id cannot be treating", () => {
    expect(
      canViewScaleContent(
        input({ viewerProfessionalProfileId: null, patientReferenceProfessionalId: null })
      )
    ).toBe(false)
  })
})

describe("canManageScales", () => {
  it("READ does not grant manage", () => {
    expect(canManageScales(input({ viewerEscalasAccess: "READ" }))).toBe(false)
  })

  it("WRITE + treating professional grants manage", () => {
    expect(canManageScales(input({ viewerEscalasAccess: "WRITE" }))).toBe(true)
  })

  it("ADMIN WRITE override grants manage", () => {
    expect(
      canManageScales(
        input({
          viewerRole: "ADMIN",
          viewerEscalasAccess: "WRITE",
          viewerProfessionalProfileId: null,
          patientReferenceProfessionalId: "x",
        })
      )
    ).toBe(true)
  })

  it("non-treating PROFESSIONAL with WRITE cannot manage", () => {
    expect(
      canManageScales(
        input({ patientReferenceProfessionalId: "other", viewerHasAppointmentWithPatient: false })
      )
    ).toBe(false)
  })
})
