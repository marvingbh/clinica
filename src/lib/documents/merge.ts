import { SESSION_TABLE_TOKEN } from "./types"

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g

/**
 * Extract every distinct, well-formed placeholder key from a body.
 * Malformed tags (e.g. `{{ }}`, `{{ 123 }}`, `{{a-b}}`) are ignored.
 */
export function extractPlaceholderKeys(body: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((match = PLACEHOLDER_RE.exec(body)) !== null) {
    const key = match[1]
    if (!seen.has(key)) {
      seen.add(key)
      found.push(key)
    }
  }
  return found
}

export interface MergeResult {
  content: string
  unresolved: string[]
}

/**
 * Substitute `{{key}}` with `values[key]`. Keys present in `optionalKeys` that
 * have no value resolve to "" and any line that becomes empty as a result is
 * removed. Required keys without a value are left untouched and reported in
 * `unresolved`.
 */
export function mergeTemplate(
  body: string,
  values: Record<string, string>,
  optionalKeys: string[]
): MergeResult {
  const optional = new Set(optionalKeys)
  const unresolved: string[] = []
  // Track which lines had an optional placeholder removed so we can drop a
  // line that became empty only because of the removal.
  const linesWithOptionalRemoval = new Set<number>()

  const lines = body.split("\n")
  const merged = lines.map((line, idx) => {
    return line.replace(PLACEHOLDER_RE, (full, key: string) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key]
      }
      if (optional.has(key)) {
        linesWithOptionalRemoval.add(idx)
        return ""
      }
      if (!unresolved.includes(key)) unresolved.push(key)
      return full
    })
  })

  const kept = merged.filter((line, idx) => {
    if (line.trim().length > 0) return true
    // Empty line: keep it (paragraph break) unless it became empty purely
    // because an optional placeholder was stripped and there is no original
    // text on that line.
    if (linesWithOptionalRemoval.has(idx) && lines[idx].replace(PLACEHOLDER_RE, "").trim() === "") {
      return false
    }
    return true
  })

  return { content: kept.join("\n"), unresolved }
}

export interface SplitContent {
  before: string
  hasTable: boolean
  after: string
}

/**
 * Split a merged body around the session-table token. When the token is
 * absent, `before` holds the full content and `hasTable` is false.
 */
export function splitContentBySessionTable(content: string): SplitContent {
  const idx = content.indexOf(SESSION_TABLE_TOKEN)
  if (idx === -1) {
    return { before: content, hasTable: false, after: "" }
  }
  return {
    before: content.slice(0, idx).replace(/\n+$/, ""),
    hasTable: true,
    after: content.slice(idx + SESSION_TABLE_TOKEN.length).replace(/^\n+/, ""),
  }
}
