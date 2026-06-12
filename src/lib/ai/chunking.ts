/**
 * Input truncation (pure). Keeps the prompt within a safe size and never cuts
 * a pseudonymization token (e.g. `[CPF_1]`) in half.
 */

export const MAX_INPUT_CHARS = 24_000

export interface TruncateResult {
  text: string
  truncated: boolean
}

/**
 * Truncate `text` to at most `max` characters, cutting on a word boundary and
 * never inside an open `[...]` token. Returns `truncated: false` when no cut
 * was needed.
 */
export function truncateInput(text: string, max = MAX_INPUT_CHARS): TruncateResult {
  if (text.length <= max) return { text, truncated: false }

  let cut = text.slice(0, max)

  // If we cut inside an unclosed token `[...`, back up to before the `[`.
  const lastOpen = cut.lastIndexOf("[")
  const lastClose = cut.lastIndexOf("]")
  if (lastOpen > lastClose) {
    cut = cut.slice(0, lastOpen)
  }

  // Back up to the last whitespace to avoid cutting a word mid-way.
  const lastSpace = cut.search(/\s\S*$/)
  if (lastSpace > 0) {
    cut = cut.slice(0, lastSpace)
  }

  return { text: cut.trimEnd(), truncated: true }
}
