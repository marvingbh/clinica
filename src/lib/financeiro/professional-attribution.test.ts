import { describe, it, expect } from "vitest"
import {
  getAttributionLayout,
  enrichItemDescription,
  CREDITS_SECTION_LABEL,
  OTHERS_SECTION_LABEL,
} from "./professional-attribution"

interface Item {
  appointmentId: string | null
  type: string
  attendingProfessionalId: string | null
  attendingProfessionalName: string | null
}

const apt = (
  id: string,
  type: string,
  profId: string | null,
  profName: string | null,
): Item => ({
  appointmentId: id,
  type,
  attendingProfessionalId: profId,
  attendingProfessionalName: profName,
})

const credit = (): Item => ({
  appointmentId: null,
  type: "CREDITO",
  attendingProfessionalId: null,
  attendingProfessionalName: null,
})

describe("getAttributionLayout", () => {
  it("single mode when zero attending professionals (all manual)", () => {
    const items = [apt("a", "SESSAO_EXTRA", null, null)]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    expect(out.mode).toBe("single")
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].header).toBeNull()
    expect(out.sections[0].items).toEqual(items)
  })

  it("single mode when only one attending professional", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_REGULAR", "p1", "Elena"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    expect(out.mode).toBe("single")
    expect(out.headerLine).toBe("Técnico de referência: Elena")
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].items).toHaveLength(2)
  })

  it("multi mode with two attending professionals — preserves input order", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_GRUPO", "p2", "Cherlen"),
      apt("c", "SESSAO_REGULAR", "p1", "Elena"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    expect(out.mode).toBe("multi")
    expect(out.sections.map(s => s.header)).toEqual([
      "Atendido por Elena",
      "Atendido por Cherlen",
    ])
    expect(out.sections[0].items.map(i => i.appointmentId)).toEqual(["a", "c"])
    expect(out.sections[1].items.map(i => i.appointmentId)).toEqual(["b"])
  })

  it("multi mode appends an Outros section for items without attending prof", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_GRUPO", "p2", "Cherlen"),
      apt("c", "SESSAO_EXTRA", null, null),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    const headers = out.sections.map(s => s.header)
    expect(headers).toContain(OTHERS_SECTION_LABEL)
    const others = out.sections.find(s => s.kind === "others")!
    expect(others.items.map(i => i.appointmentId)).toEqual(["c"])
  })

  it("multi mode appends a Créditos section for credit items", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_GRUPO", "p2", "Cherlen"),
      credit(),
      credit(),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    const credits = out.sections.find(s => s.kind === "credits")!
    expect(credits.header).toBe(CREDITS_SECTION_LABEL)
    expect(credits.items).toHaveLength(2)
    // Credits do not contribute to the prof count
    expect(out.mode).toBe("multi")
  })

  it("header falls back to Profissional when no reference, single attending", () => {
    const items = [apt("a", "SESSAO_REGULAR", "p1", "Elena")]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: null,
      invoiceProfessionalName: "Invoice Owner",
    })
    expect(out.headerLine).toBe("Profissional: Elena")
  })

  it("header omitted when no reference and multiple attending", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_REGULAR", "p2", "Cherlen"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: null,
      invoiceProfessionalName: "Invoice Owner",
    })
    expect(out.headerLine).toBeNull()
  })

  it("falls back to invoiceProfessionalName when no reference and zero attendings", () => {
    const items = [apt("a", "SESSAO_EXTRA", null, null)]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: null,
      invoiceProfessionalName: "Invoice Owner",
    })
    expect(out.headerLine).toBe("Profissional: Invoice Owner")
  })

  it("treats a missing attendingProfessionalName as 'Profissional' label", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", null),
      apt("b", "SESSAO_REGULAR", "p2", "Cherlen"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    expect(out.mode).toBe("multi")
    const headers = out.sections.filter(s => s.kind === "professional").map(s => s.header)
    expect(headers).toEqual(["Atendido por Profissional", "Atendido por Cherlen"])
  })
})

describe("enrichItemDescription", () => {
  it("rewrites legacy SESSAO_GRUPO with the therapy group name", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_GRUPO", baseDescription: "Sessão grupo - 10/03", groupName: "Keep Lua" },
      { includeGroupName: true },
    )
    expect(out).toBe("Psicoterapia em grupo — Keep Lua - 10/03")
  })

  it("rewrites legacy SESSAO_GRUPO without group name to the new label", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_GRUPO", baseDescription: "Sessão grupo - 10/03" },
      { includeGroupName: true },
    )
    expect(out).toBe("Psicoterapia em grupo - 10/03")
  })

  it("injects the group name when the description already uses the new label", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_GRUPO", baseDescription: "Psicoterapia em grupo - 10/03", groupName: "Keep Lua" },
      { includeGroupName: true },
    )
    expect(out).toBe("Psicoterapia em grupo — Keep Lua - 10/03")
  })

  it("rewrites legacy SESSAO_REGULAR to Psicoterapia individual", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_REGULAR", baseDescription: "Sessão - 02/03" },
    )
    expect(out).toBe("Psicoterapia individual - 02/03")
  })

  it("does not rewrite SESSAO_REGULAR when description starts with 'Sessão extra' or 'Sessão grupo'", () => {
    const safe1 = enrichItemDescription(
      { type: "SESSAO_REGULAR", baseDescription: "Sessão extra - 05/03" },
    )
    const safe2 = enrichItemDescription(
      { type: "SESSAO_REGULAR", baseDescription: "Sessão grupo - 05/03" },
    )
    expect(safe1).toBe("Sessão extra - 05/03")
    expect(safe2).toBe("Sessão grupo - 05/03")
  })

  it("rewrites SESSAO_EXTRA to Psicoterapia Individual (extra)", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_EXTRA", baseDescription: "Sessão extra - 05/03" },
    )
    expect(out).toBe("Psicoterapia Individual (extra) - 05/03")
  })

  it("rewrites legacy REUNIAO_ESCOLA fallback to Reunião Agendada", () => {
    const out = enrichItemDescription(
      { type: "REUNIAO_ESCOLA", baseDescription: "Reunião escola - 17/04" },
    )
    expect(out).toBe("Reunião Agendada - 17/04")
  })

  it("preserves a custom REUNIAO_ESCOLA title untouched", () => {
    const out = enrichItemDescription(
      { type: "REUNIAO_ESCOLA", baseDescription: "Reunião na escola Marista - 17/04" },
    )
    expect(out).toBe("Reunião na escola Marista - 17/04")
  })

  it("does not rewrite non-group types even when groupName is set", () => {
    const out = enrichItemDescription(
      { type: "SESSAO_REGULAR", baseDescription: "Psicoterapia individual - 02/03", groupName: "Keep Lua" },
      { includeGroupName: true },
    )
    expect(out).toBe("Psicoterapia individual - 02/03")
  })

  it("appends attending name when includeAttendingName is true", () => {
    const out = enrichItemDescription(
      {
        type: "SESSAO_REGULAR",
        baseDescription: "Sessão - 02/03",
        attendingProfessionalName: "Elena",
      },
      { includeAttendingName: true },
    )
    expect(out).toBe("Psicoterapia individual - 02/03 · Elena")
  })

  it("does not append attending name on CREDITO items", () => {
    const out = enrichItemDescription(
      {
        type: "CREDITO",
        baseDescription: "Crédito: Desmarcou - 17/03",
        attendingProfessionalName: "Elena",
      },
      { includeAttendingName: true },
    )
    expect(out).toBe("Crédito: Desmarcou - 17/03")
  })

  it("composes group name + attending name when both options are on", () => {
    const out = enrichItemDescription(
      {
        type: "SESSAO_GRUPO",
        baseDescription: "Sessão grupo - 10/03",
        groupName: "Keep Lua",
        attendingProfessionalName: "Cherlen",
      },
      { includeGroupName: true, includeAttendingName: true },
    )
    expect(out).toBe("Psicoterapia em grupo — Keep Lua - 10/03 · Cherlen")
  })
})
