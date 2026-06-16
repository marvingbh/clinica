import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveClinicSender, isAddressOnDomain, type ClinicSenderInput } from "./sender"

function clinic(overrides: Partial<ClinicSenderInput> = {}): ClinicSenderInput {
  return {
    name: "Clínica Exemplo",
    email: "contato@clinica.com.br",
    emailSenderName: null,
    emailFromAddress: null,
    emailDomain: null,
    emailDomainStatus: null,
    ...overrides,
  }
}

describe("isAddressOnDomain", () => {
  it("matches the exact domain", () => {
    expect(isAddressOnDomain("naoresponda@elenasabino.com.br", "elenasabino.com.br")).toBe(true)
  })
  it("matches a subdomain", () => {
    expect(isAddressOnDomain("x@send.elenasabino.com.br", "elenasabino.com.br")).toBe(true)
  })
  it("rejects a different domain", () => {
    expect(isAddressOnDomain("naoresponda@outra.com.br", "elenasabino.com.br")).toBe(false)
  })
})

describe("resolveClinicSender", () => {
  const OLD = process.env.EMAIL_SHARED_DOMAIN
  const OLD_FROM = process.env.RESEND_FROM_EMAIL
  beforeEach(() => {
    delete process.env.EMAIL_SHARED_DOMAIN
    delete process.env.RESEND_FROM_EMAIL
  })
  afterEach(() => {
    if (OLD === undefined) delete process.env.EMAIL_SHARED_DOMAIN; else process.env.EMAIL_SHARED_DOMAIN = OLD
    if (OLD_FROM === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = OLD_FROM
  })

  it("uses the clinic's verified domain address when on-domain", () => {
    const s = resolveClinicSender(clinic({ emailDomain: "elenasabino.com.br", emailDomainStatus: "verified", emailFromAddress: "contato@elenasabino.com.br" }))
    expect(s).toEqual({ fromEmail: "contato@elenasabino.com.br", fromName: "Clínica Exemplo", replyTo: "contato@clinica.com.br" })
  })

  it("defaults to naoresponda@<domain> when verified but from-address is off-domain", () => {
    const s = resolveClinicSender(clinic({ emailDomain: "elenasabino.com.br", emailDomainStatus: "verified", emailFromAddress: "old@gmail.com" }))
    expect(s?.fromEmail).toBe("naoresponda@elenasabino.com.br")
  })

  it("does NOT use the custom domain until it is verified", () => {
    process.env.EMAIL_SHARED_DOMAIN = "clinicaapp.com.br"
    const s = resolveClinicSender(clinic({ emailDomain: "elenasabino.com.br", emailDomainStatus: "pending" }))
    expect(s?.fromEmail).toBe("notificacao@clinicaapp.com.br")
  })

  it("falls back to the shared SaaS domain with the clinic name + reply-to", () => {
    process.env.EMAIL_SHARED_DOMAIN = "clinicaapp.com.br"
    const s = resolveClinicSender(clinic({ emailSenderName: "Clínica Bem-Estar" }))
    expect(s).toEqual({ fromEmail: "notificacao@clinicaapp.com.br", fromName: "Clínica Bem-Estar", replyTo: "contato@clinica.com.br" })
  })

  it("uses the legacy env sender when no shared domain is set", () => {
    process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev"
    const s = resolveClinicSender(clinic())
    expect(s?.fromEmail).toBe("onboarding@resend.dev")
  })

  it("returns null when nothing is configured", () => {
    expect(resolveClinicSender(clinic())).toBeNull()
  })
})
