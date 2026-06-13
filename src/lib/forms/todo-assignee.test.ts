import { describe, it, expect } from "vitest"
import { resolveTodoAssignee } from "./todo-assignee"

describe("resolveTodoAssignee", () => {
  it("prefers the patient's reference professional", () => {
    expect(
      resolveTodoAssignee({
        patientReferenceProfessionalId: "ref",
        responseProfessionalProfileId: "sender",
      })
    ).toBe("ref")
  })

  it("falls back to the send's professional", () => {
    expect(
      resolveTodoAssignee({
        patientReferenceProfessionalId: null,
        responseProfessionalProfileId: "sender",
      })
    ).toBe("sender")
  })

  it("returns null when neither is set", () => {
    expect(
      resolveTodoAssignee({
        patientReferenceProfessionalId: null,
        responseProfessionalProfileId: null,
      })
    ).toBeNull()
  })
})
