export { encrypt, decrypt } from "./encryption"
export {
  matchTransactions,
  normalizeForComparison,
  nameSimilarity,
  surnameMatches,
  nameContainedIn,
  findGroupCandidates,
  getSharedParent,
} from "./matcher"
export type { InvoiceWithParent } from "./matcher"
export { fetchStatements, extractPayerName } from "./inter-client"
export type {
  TransactionForMatching,
  InvoiceForMatching,
  MatchConfidence,
  MatchCandidate,
  MatchResult,
} from "./types"
export type { InterConfig } from "./inter-client"
