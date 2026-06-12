/**
 * LGPD pseudonymization (pure). Replaces patient PII with stable tokens before
 * any external call, and re-identifies tokens in the provider response locally.
 *
 * Heuristic by design (RN6/R3): a generic regex scrub catches third-party CPFs,
 * phones and e-mails mentioned in free text; human review (review-first) and
 * zero payload persistence are the backstops.
 */

import type { SectionMap } from "./types"

export interface PseudonymEntity {
  token: string
  value: string
}

export interface PseudonymResult {
  text: string
  tokenMap: PseudonymEntity[]
}

export interface PseudonymPatient {
  name: string
  motherName?: string | null
  fatherName?: string | null
  cpf?: string | null
  billingCpf?: string | null
  phone?: string | null
  email?: string | null
}

/** Minimum length for an isolated first name to be replaced (avoids "Ana"). */
const MIN_FIRST_NAME_LEN = 4

// Masked CPF only (###.###.###-##). Bare 11-digit strings are treated as phones
// (mobile DDD + 9 + 8 digits) — phones are scrubbed before CPFs below.
const CPF_RE = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g
// BR phone: optional +55, optional DDD (parens/separators allowed), 8-9 local
// digits. Also matches bare 10-11 digit runs (mobile/landline without mask).
const PHONE_RE =
  /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]\d{4}|(?<!\d)(?:\+?55)?\d{10,13}(?!\d)/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Normalize accents (NFD) + lowercase for case/accent-insensitive name matching. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build the entity map from a patient. Optional/absent fields produce no tokens.
 * Two CPFs (cpf + billingCpf) get distinct tokens that never collide.
 */
export function buildEntityMap(patient: PseudonymPatient): PseudonymEntity[] {
  const entities: PseudonymEntity[] = []

  const fullName = patient.name?.trim()
  if (fullName) {
    entities.push({ token: "[PACIENTE]", value: fullName })
    // First name on its own (only when long enough to avoid false positives).
    const first = fullName.split(/\s+/)[0]
    if (first && first.length >= MIN_FIRST_NAME_LEN && normalize(first) !== normalize(fullName)) {
      entities.push({ token: "[PACIENTE]", value: first })
    }
  }
  if (patient.motherName?.trim()) entities.push({ token: "[MAE]", value: patient.motherName.trim() })
  if (patient.fatherName?.trim()) entities.push({ token: "[PAI]", value: patient.fatherName.trim() })

  let cpfIdx = 0
  for (const cpf of [patient.cpf, patient.billingCpf]) {
    if (cpf?.trim()) entities.push({ token: `[CPF_${++cpfIdx}]`, value: cpf.trim() })
  }
  if (patient.phone?.trim()) entities.push({ token: "[TEL_1]", value: patient.phone.trim() })
  if (patient.email?.trim()) entities.push({ token: "[EMAIL_1]", value: patient.email.trim() })

  return entities
}

/** Replace a name value as whole words, case/accent-insensitive. */
function replaceName(text: string, value: string, token: string): string {
  const normValue = normalize(value)
  // Word-boundary match on the normalized form; rebuild from original by index.
  const words = normValue.split(/\s+/).map(escapeRegExp).join("\\s+")
  const re = new RegExp(`(?<![\\p{L}])${words}(?![\\p{L}])`, "giu")
  const normText = normalize(text)
  // Map matches found on normalized text back to original-position slices.
  let result = ""
  let lastEnd = 0
  for (const m of normText.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    result += text.slice(lastEnd, start) + token
    lastEnd = end
  }
  result += text.slice(lastEnd)
  return result
}

/**
 * Pseudonymize free text: patient entities first (longest-first so full name
 * wins over first name), then a generic scrub of third-party CPF/phone/e-mail.
 */
export function pseudonymizeText(text: string, entities: PseudonymEntity[]): PseudonymResult {
  if (!text) return { text: "", tokenMap: [] }
  const tokenMap: PseudonymEntity[] = []
  let out = text

  // Sort by descending value length so "Maria Silva" replaces before "Maria".
  const sorted = [...entities].sort((a, b) => b.value.length - a.value.length)
  for (const ent of sorted) {
    const before = out
    // CPF/phone/e-mail entities are exact-value; names use whole-word matching.
    if (/^\[(PACIENTE|MAE|PAI)\]$/.test(ent.token)) {
      out = replaceName(out, ent.value, ent.token)
    } else {
      out = out.split(ent.value).join(ent.token)
    }
    if (out !== before && !tokenMap.some((t) => t.token === ent.token && t.value === ent.value)) {
      tokenMap.push(ent)
    }
  }

  // Generic scrub of remaining third-party PII not already tokenized.
  // Order matters: e-mail, then masked CPF, then phone (bare digit runs).
  let xCpf = 0
  let xTel = 0
  let xEmail = 0
  out = out.replace(EMAIL_RE, () => `[EMAIL_X${++xEmail}]`)
  out = out.replace(CPF_RE, () => `[CPF_X${++xCpf}]`)
  out = out.replace(PHONE_RE, () => `[TEL_X${++xTel}]`)

  return { text: out, tokenMap }
}

/** Re-substitute tokens with their original values (provider response). */
export function reidentifyText(text: string, tokenMap: PseudonymEntity[]): string {
  if (!text) return text
  let out = text
  // Longest token first so [PACIENTE] doesn't partially match other tokens.
  const sorted = [...tokenMap].sort((a, b) => b.token.length - a.token.length)
  for (const ent of sorted) {
    out = out.split(ent.token).join(ent.value)
  }
  return out
}

/** Re-identify every section in a SectionMap. */
export function pseudonymizeSections(sections: SectionMap, tokenMap: PseudonymEntity[]): SectionMap {
  const out: SectionMap = {}
  for (const [key, value] of Object.entries(sections)) {
    out[key] = reidentifyText(value, tokenMap)
  }
  return out
}
