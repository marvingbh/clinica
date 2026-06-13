import { describe, it, expect } from "vitest"
import { needsTelepsychContractWarning } from "./telepsych"

describe("telepsych", () => {
  it("warns only for online CONSULTA without a signed contract", () => {
    expect(needsTelepsychContractWarning({ type: "CONSULTA", modality: "ONLINE", hasSignedContract: false })).toBe(true)
  })
  it("no warning when contract is signed", () => {
    expect(needsTelepsychContractWarning({ type: "CONSULTA", modality: "ONLINE", hasSignedContract: true })).toBe(false)
  })
  it("no warning for presencial / null modality / non-consulta", () => {
    expect(needsTelepsychContractWarning({ type: "CONSULTA", modality: "PRESENCIAL", hasSignedContract: false })).toBe(false)
    expect(needsTelepsychContractWarning({ type: "CONSULTA", modality: null, hasSignedContract: false })).toBe(false)
    expect(needsTelepsychContractWarning({ type: "TAREFA", modality: "ONLINE", hasSignedContract: false })).toBe(false)
  })
})
