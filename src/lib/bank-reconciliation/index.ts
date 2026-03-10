export { encrypt, decrypt } from "./encryption"
export {
  matchTransactions,
  normalizeForComparison,
  nameSimilarity,
  surnameMatches,
  nameContainedIn,
} from "./matcher"
export { fetchStatements } from "./inter-client"
export type {
  TransactionForMatching,
  InvoiceForMatching,
  MatchConfidence,
  MatchCandidate,
  MatchResult,
} from "./types"
export type { InterConfig } from "./inter-client"
