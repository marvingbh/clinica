import { describe, it, expect } from "vitest"
import {
  getAttributionLayout,
  CREDITS_SECTION_LABEL,
  OTHERS_SECTION_LABEL,
} from "./professional-attribution"

interface Item {
  id: string
  type: string
  attendingProfessionalId: string | null
  attendingProfessionalName: string | null
}

const apt = (
  id: string,
  type: string,
  profId: string | null,
  profName: string | null,
): Item => ({ id, type, attendingProfessionalId: profId, attendingProfessionalName: profName })

const credit = (id: string): Item => apt(id, "CREDITO", null, null)

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
    expect(out.header).toEqual({ label: "Técnico de referência", name: "Elena" })
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].items).toHaveLength(2)
  })

  it("preserves the source items in section.items (no projection)", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_GRUPO", "p2", "Cherlen"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    // Identity is preserved — same object references come back inside sections.
    expect(out.sections[0].items[0]).toBe(items[0])
    expect(out.sections[1].items[0]).toBe(items[1])
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
    expect(out.sections[0].items.map(i => i.id)).toEqual(["a", "c"])
    expect(out.sections[1].items.map(i => i.id)).toEqual(["b"])
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
    expect(out.sections.map(s => s.header)).toContain(OTHERS_SECTION_LABEL)
    const others = out.sections.find(s => s.header === OTHERS_SECTION_LABEL)!
    expect(others.items.map(i => i.id)).toEqual(["c"])
  })

  it("multi mode appends a Créditos section for credit items", () => {
    const items = [
      apt("a", "SESSAO_REGULAR", "p1", "Elena"),
      apt("b", "SESSAO_GRUPO", "p2", "Cherlen"),
      credit("c1"),
      credit("c2"),
    ]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: "Elena",
      invoiceProfessionalName: "Elena",
    })
    const credits = out.sections.find(s => s.header === CREDITS_SECTION_LABEL)!
    expect(credits.items.map(i => i.id)).toEqual(["c1", "c2"])
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
    expect(out.header).toEqual({ label: "Profissional", name: "Elena" })
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
    expect(out.header).toBeNull()
  })

  it("falls back to invoiceProfessionalName when no reference and zero attendings", () => {
    const items = [apt("a", "SESSAO_EXTRA", null, null)]
    const out = getAttributionLayout({
      items,
      referenceProfessionalName: null,
      invoiceProfessionalName: "Invoice Owner",
    })
    expect(out.header).toEqual({ label: "Profissional", name: "Invoice Owner" })
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
    expect(out.sections.map(s => s.header)).toEqual([
      "Atendido por Profissional",
      "Atendido por Cherlen",
    ])
  })
})
