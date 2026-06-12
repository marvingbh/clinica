import type { DocumentType, MergeContext, MissingField } from "./types"
import { getPlaceholder } from "./placeholders"

/** Document types that are privative clinical acts of the psychologist. */
export const CLINICAL_DOCUMENT_TYPES: DocumentType[] = [
  "RELATORIO_PSICOLOGICO",
  "LAUDO_PSICOLOGICO",
  "PARECER_PSICOLOGICO",
  "ATESTADO_PSICOLOGICO",
]

/** true when birthDate puts the patient under 18 at the reference date. */
export function isMinor(birthDate: Date | null, reference: Date): boolean {
  if (!birthDate) return false
  let age = reference.getFullYear() - birthDate.getFullYear()
  const m = reference.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && reference.getDate() < birthDate.getDate())) {
    age--
  }
  return age < 18
}

/**
 * Regra 3: when the clinic restricts clinical docs to professionals, only a
 * user with a professional profile may generate one of the clinical types.
 */
export function canGenerateClinicalDoc(
  type: DocumentType,
  restrictToProfessionals: boolean,
  professionalProfileId: string | null
): boolean {
  if (!restrictToProfessionals) return true
  if (!CLINICAL_DOCUMENT_TYPES.includes(type)) return true
  return professionalProfileId !== null
}

/**
 * Validate a generation request. Returns the blocking checklist (empty when
 * the document can be generated). A placeholder is blocking when it appears in
 * the body, is required for the type, and resolves to null.
 */
export function validateGeneration(
  type: DocumentType,
  bodyKeys: string[],
  ctx: MergeContext
): MissingField[] {
  const missing: MissingField[] = []
  const seen = new Set<string>()

  for (const key of bodyKeys) {
    const def = getPlaceholder(key)
    if (!def) continue
    if (!def.requiredFor.includes(type)) continue
    const resolved = def.resolve(ctx)
    if (resolved !== null && resolved !== "") continue
    if (seen.has(key)) continue
    seen.add(key)
    missing.push({
      key,
      label: def.missingLabel ?? def.label,
      quickFixPath: resolveQuickFixPath(key, def.quickFixPath ?? null),
    })
  }

  // Contrato terapêutico for a minor requires a guardian even if the body does
  // not literally reference {{guardianName}}.
  if (
    type === "CONTRATO_TERAPEUTICO" &&
    isMinor(ctx.patient.birthDate, ctx.generatedAt) &&
    !seen.has("guardianName")
  ) {
    const guardian = getPlaceholder("guardianName")
    if (guardian && guardian.resolve(ctx) === null) {
      missing.push({
        key: "guardianName",
        label: "Responsável do paciente não cadastrado",
        quickFixPath: null,
      })
    }
  }

  return missing
}

function resolveQuickFixPath(key: string, base: string | null): string | null {
  if (key === "patientCpf") {
    // patient id is not in the context; the route augments this when known.
    return "/patients"
  }
  return base
}
