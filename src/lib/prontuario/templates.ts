import type { ClinicalNoteFormat, SectionDef } from "./types"

/**
 * Default pt-BR note templates seeded lazily per clinic.
 * Section ids are stable (used as JSON keys in ClinicalNote.sections) and must
 * never change once notes exist.
 */
export const DEFAULT_TEMPLATES: ReadonlyArray<{
  name: string
  format: ClinicalNoteFormat
  sectionDefs: SectionDef[]
}> = [
  {
    name: "SOAP",
    format: "SOAP",
    sectionDefs: [
      { id: "subjetivo", label: "Subjetivo", helpText: "Relato do paciente, queixas e percepções." },
      { id: "objetivo", label: "Objetivo", helpText: "Observações e dados objetivos da sessão." },
      { id: "avaliacao", label: "Avaliação", helpText: "Análise clínica e hipóteses." },
      { id: "plano", label: "Plano", helpText: "Condutas e próximos passos." },
    ],
  },
  {
    name: "DAP",
    format: "DAP",
    sectionDefs: [
      { id: "dados", label: "Dados", helpText: "Dados subjetivos e objetivos da sessão." },
      { id: "avaliacao", label: "Avaliação", helpText: "Análise clínica e hipóteses." },
      { id: "plano", label: "Plano", helpText: "Condutas e próximos passos." },
    ],
  },
  {
    name: "Livre",
    format: "LIVRE",
    sectionDefs: [{ id: "registro", label: "Registro", helpText: "Registro livre da sessão." }],
  },
]

/**
 * Validate a `sectionDefs` payload (e.g. from a custom template body).
 * Throws on invalid shape; returns the normalized SectionDef[] on success.
 */
export function validateSectionDefs(defs: unknown): SectionDef[] {
  if (!Array.isArray(defs) || defs.length === 0) {
    throw new Error("sectionDefs deve ser uma lista não vazia.")
  }
  const seen = new Set<string>()
  const result: SectionDef[] = []
  for (const raw of defs) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Cada seção deve ser um objeto.")
    }
    const obj = raw as Record<string, unknown>
    const id = obj.id
    const label = obj.label
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("Cada seção precisa de um id não vazio.")
    }
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error("Cada seção precisa de um label não vazio.")
    }
    if (seen.has(id)) {
      throw new Error(`Id de seção duplicado: ${id}`)
    }
    seen.add(id)
    const def: SectionDef = { id, label }
    if (obj.helpText !== undefined) {
      if (typeof obj.helpText !== "string") {
        throw new Error("helpText deve ser uma string.")
      }
      def.helpText = obj.helpText
    }
    result.push(def)
  }
  return result
}
