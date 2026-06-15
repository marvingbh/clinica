import { describe, it, expect } from "vitest"
import { PUBLIC_PAGE_PREFIXES, isPublicPagePath } from "./public-paths"

describe("isPublicPagePath", () => {
  it("matches each new patient-facing public flow", () => {
    expect(isPublicPagePath("/paciente/abc-slug")).toBe(true)
    expect(isPublicPagePath("/pagar/obrigado")).toBe(true)
    expect(isPublicPagePath("/oferta")).toBe(true)
    expect(isPublicPagePath("/assinar/token123")).toBe(true)
    expect(isPublicPagePath("/escala/token123")).toBe(true)
    expect(isPublicPagePath("/verificar/CODE")).toBe(true)
    expect(isPublicPagePath("/teleconsulta/token123")).toBe(true)
    expect(isPublicPagePath("/agendar/clinica-x")).toBe(true)
    expect(isPublicPagePath("/intake/clinica-x")).toBe(true)
  })

  it("matches the public form-fill page via the /f/ prefix", () => {
    expect(isPublicPagePath("/f/token123")).toBe(true)
  })

  it("does not let /f/ collide with /financeiro or /formularios", () => {
    expect(isPublicPagePath("/financeiro")).toBe(false)
    expect(isPublicPagePath("/financeiro/dmed")).toBe(false)
    expect(isPublicPagePath("/formularios")).toBe(false)
  })

  it("matches auth/static public pages", () => {
    expect(isPublicPagePath("/login")).toBe(true)
    expect(isPublicPagePath("/signup")).toBe(true)
    expect(isPublicPagePath("/confirm")).toBe(true)
    expect(isPublicPagePath("/cancel")).toBe(true)
  })

  it("rejects authenticated app routes", () => {
    expect(isPublicPagePath("/")).toBe(false)
    expect(isPublicPagePath("/agenda")).toBe(false)
    expect(isPublicPagePath("/patients")).toBe(false)
    expect(isPublicPagePath("/espera")).toBe(false)
    expect(isPublicPagePath("/tarefas")).toBe(false)
    expect(isPublicPagePath("/prontuario/abc")).toBe(false)
  })

  it("exposes a stable, deduplicated prefix list", () => {
    expect(new Set(PUBLIC_PAGE_PREFIXES).size).toBe(PUBLIC_PAGE_PREFIXES.length)
  })
})
