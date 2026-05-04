import { describe, expect, it } from "vitest"
import { ENTRY_TYPE_COLORS } from "@/app/agenda/lib/constants"
import { PALETTE_CLASSES } from "./palette"
import {
  DEFAULT_AGENDA_COLORS,
  agendaColorsPatchSchema,
  agendaColorsSchema,
  resolveAgendaColors,
} from "./schema"
import { appointmentColorsFor, paletteFor } from "./resolvers"
import { AGENDA_COLOR_SLOTS, PALETTE_NAMES } from "./types"

describe("PALETTE_CLASSES literal map", () => {
  it("has an entry for every PaletteName", () => {
    for (const name of PALETTE_NAMES) {
      expect(PALETTE_CLASSES[name]).toBeDefined()
      expect(PALETTE_CLASSES[name].bg).toMatch(/^bg-([a-z]+-50|white)$/)
      expect(PALETTE_CLASSES[name].border).toMatch(/^border-[a-z]+-200$/)
      expect(PALETTE_CLASSES[name].borderLeft).toMatch(/^border-l-[a-z]+-(500|700)$/)
      expect(PALETTE_CLASSES[name].text).toMatch(/^text-([a-z]+-(700|800)|black)$/)
      expect(PALETTE_CLASSES[name].accent).toMatch(/^bg-([a-z]+-500|black)$/)
    }
  })

  it("uses -800 text on yellow and lime for AA contrast", () => {
    expect(PALETTE_CLASSES.yellow.text).toBe("text-yellow-800")
    expect(PALETTE_CLASSES.lime.text).toBe("text-lime-800")
  })

  it("white palette uses bg-white + text-black for the original CONSULTA look", () => {
    expect(PALETTE_CLASSES.white.bg).toBe("bg-white")
    expect(PALETTE_CLASSES.white.text).toBe("text-black")
  })
})

describe("resolveAgendaColors — defaults handling", () => {
  it("returns defaults for undefined", () => {
    expect(resolveAgendaColors(undefined)).toEqual(DEFAULT_AGENDA_COLORS)
  })

  it("returns defaults for null", () => {
    expect(resolveAgendaColors(null)).toEqual(DEFAULT_AGENDA_COLORS)
  })

  it("returns defaults for an empty object", () => {
    expect(resolveAgendaColors({})).toEqual(DEFAULT_AGENDA_COLORS)
  })

  it("returns defaults for a top-level scalar", () => {
    expect(resolveAgendaColors("red")).toEqual(DEFAULT_AGENDA_COLORS)
    expect(resolveAgendaColors(42)).toEqual(DEFAULT_AGENDA_COLORS)
    expect(resolveAgendaColors(true)).toEqual(DEFAULT_AGENDA_COLORS)
  })

  it("returns defaults for a top-level array", () => {
    expect(resolveAgendaColors(["red", "blue"])).toEqual(DEFAULT_AGENDA_COLORS)
    expect(resolveAgendaColors([])).toEqual(DEFAULT_AGENDA_COLORS)
  })

  it("default object is frozen", () => {
    expect(Object.isFrozen(DEFAULT_AGENDA_COLORS)).toBe(true)
  })

  it("returned object is frozen", () => {
    const result = resolveAgendaColors({ consulta: "purple" })
    expect(Object.isFrozen(result)).toBe(true)
  })
})

describe("resolveAgendaColors — partial / unknown values", () => {
  it("merges a partial object with defaults", () => {
    const result = resolveAgendaColors({ consulta: "purple" })
    expect(result.consulta).toBe("purple")
    expect(result.reuniao).toBe(DEFAULT_AGENDA_COLORS.reuniao)
    expect(result.lembrete).toBe(DEFAULT_AGENDA_COLORS.lembrete)
    expect(result.groupSession).toBe(DEFAULT_AGENDA_COLORS.groupSession)
    expect(result.availability).toBe(DEFAULT_AGENDA_COLORS.availability)
  })

  it("silently drops unknown keys", () => {
    const result = resolveAgendaColors({ consulta: "purple", evil: "rgb(255,0,0)", foo: 42 })
    expect(result.consulta).toBe("purple")
    expect((result as unknown as Record<string, unknown>).evil).toBeUndefined()
    expect((result as unknown as Record<string, unknown>).foo).toBeUndefined()
  })

  it("falls back to default when palette name is unknown", () => {
    const result = resolveAgendaColors({ consulta: "magenta" })
    expect(result.consulta).toBe(DEFAULT_AGENDA_COLORS.consulta)
  })

  it("falls back to default when slot value isn't a string", () => {
    const result = resolveAgendaColors({ consulta: 42, reuniao: null, lembrete: ["red"] })
    expect(result.consulta).toBe(DEFAULT_AGENDA_COLORS.consulta)
    expect(result.reuniao).toBe(DEFAULT_AGENDA_COLORS.reuniao)
    expect(result.lembrete).toBe(DEFAULT_AGENDA_COLORS.lembrete)
  })

  it("preserves a fully valid object", () => {
    const full = {
      consulta: "purple",
      reuniao: "indigo",
      lembrete: "amber",
      groupSession: "fuchsia",
      availability: "emerald",
    } as const
    expect(resolveAgendaColors(full)).toEqual(full)
  })
})

describe("agendaColorsSchema (full object)", () => {
  it("accepts a fully-valid object", () => {
    expect(agendaColorsSchema.safeParse(DEFAULT_AGENDA_COLORS).success).toBe(true)
  })

  it("rejects unknown palette names", () => {
    const r = agendaColorsSchema.safeParse({ ...DEFAULT_AGENDA_COLORS, consulta: "magenta" })
    expect(r.success).toBe(false)
  })

  it("rejects unknown keys (.strict)", () => {
    const r = agendaColorsSchema.safeParse({ ...DEFAULT_AGENDA_COLORS, evil: "red" })
    expect(r.success).toBe(false)
  })

  it("rejects missing slots in the full schema", () => {
    const r = agendaColorsSchema.safeParse({ consulta: "red" })
    expect(r.success).toBe(false)
  })
})

describe("agendaColorsPatchSchema (PATCH partial)", () => {
  it("accepts a single-slot update", () => {
    expect(agendaColorsPatchSchema.safeParse({ consulta: "purple" }).success).toBe(true)
  })

  it("accepts an empty object", () => {
    expect(agendaColorsPatchSchema.safeParse({}).success).toBe(true)
  })

  it("rejects unknown keys (.strict)", () => {
    const r = agendaColorsPatchSchema.safeParse({ evil: "red" })
    expect(r.success).toBe(false)
  })

  it("rejects __proto__ payload (prototype pollution attempt)", () => {
    const r = agendaColorsPatchSchema.safeParse({ __proto__: { polluted: true } })
    // Note: native object spread in JSON.parse will not interpret __proto__
    // as a real prototype, but Zod should still reject the unknown key.
    expect(r.success).toBe(false)
  })

  it("rejects constructor payload", () => {
    const r = agendaColorsPatchSchema.safeParse({ constructor: "red" })
    expect(r.success).toBe(false)
  })

  it("rejects top-level array", () => {
    expect(agendaColorsPatchSchema.safeParse(["red"]).success).toBe(false)
  })

  it("rejects top-level scalar", () => {
    expect(agendaColorsPatchSchema.safeParse("red").success).toBe(false)
    expect(agendaColorsPatchSchema.safeParse(42).success).toBe(false)
  })
})

describe("paletteFor", () => {
  it("returns the configured palette for a slot", () => {
    const colors = { ...DEFAULT_AGENDA_COLORS, consulta: "purple" } as const
    expect(paletteFor("consulta", colors)).toBe(PALETTE_CLASSES.purple)
  })

  it("works for every slot", () => {
    for (const slot of AGENDA_COLOR_SLOTS) {
      const result = paletteFor(slot, DEFAULT_AGENDA_COLORS)
      expect(result).toBe(PALETTE_CLASSES[DEFAULT_AGENDA_COLORS[slot]])
    }
  })
})

describe("appointmentColorsFor", () => {
  it("uses the configured palette for CONSULTA", () => {
    expect(appointmentColorsFor("CONSULTA", DEFAULT_AGENDA_COLORS)).toBe(PALETTE_CLASSES.red)
  })

  it("uses the configured palette for REUNIAO", () => {
    expect(appointmentColorsFor("REUNIAO", DEFAULT_AGENDA_COLORS)).toBe(PALETTE_CLASSES.blue)
  })

  it("uses the configured palette for LEMBRETE", () => {
    expect(appointmentColorsFor("LEMBRETE", DEFAULT_AGENDA_COLORS)).toBe(PALETTE_CLASSES.yellow)
  })

  it("falls back to ENTRY_TYPE_COLORS for legacy TAREFA", () => {
    expect(appointmentColorsFor("TAREFA", DEFAULT_AGENDA_COLORS)).toBe(ENTRY_TYPE_COLORS.TAREFA)
  })

  it("falls back to ENTRY_TYPE_COLORS for legacy NOTA", () => {
    expect(appointmentColorsFor("NOTA", DEFAULT_AGENDA_COLORS)).toBe(ENTRY_TYPE_COLORS.NOTA)
  })
})
