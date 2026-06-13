import { describe, it, expect } from "vitest"
import { mapDocumentTypeToConsents, buildConsentUpdateData } from "./consent-sync"

describe("consent-sync", () => {
  it("maps document types to consent fields", () => {
    expect(mapDocumentTypeToConsents("CONSENTIMENTO_IMAGEM")).toEqual(["consentPhotoVideo"])
    expect(mapDocumentTypeToConsents("CONSENTIMENTO_GRAVACAO")).toEqual(["consentSessionRecording"])
    expect(mapDocumentTypeToConsents("TCLE")).toEqual([])
    expect(mapDocumentTypeToConsents("TERMO_LGPD")).toEqual([])
    expect(mapDocumentTypeToConsents("CONSENTIMENTO_MENOR")).toEqual([])
  })

  it("unknown types map to empty", () => {
    expect(mapDocumentTypeToConsents("WHATEVER")).toEqual([])
  })

  it("buildConsentUpdateData generates boolean + timestamp pairs", () => {
    const at = new Date("2026-06-11T10:00:00Z")
    expect(buildConsentUpdateData(["consentPhotoVideo"], at)).toEqual({
      consentPhotoVideo: true,
      consentPhotoVideoAt: at,
    })
    expect(buildConsentUpdateData([], at)).toEqual({})
    expect(buildConsentUpdateData(["consentSessionRecording", "consentEmail"], at)).toEqual({
      consentSessionRecording: true,
      consentSessionRecordingAt: at,
      consentEmail: true,
      consentEmailAt: at,
    })
  })
})
