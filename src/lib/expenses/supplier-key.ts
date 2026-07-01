/**
 * Normalize a description to group records for the same payee. Collapses cosmetic bank-text
 * differences (e.g. "ADMINISTRADORA & CORRETORA" vs "...E CORRETORA", punctuation) while
 * PRESERVING digit tokens — account numbers (e.g. a utility account) and payee IDs must keep
 * distinct suppliers apart.
 */
export function supplierKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[\s.\-:;,/_]+/g, " ")
    .trim()
}
