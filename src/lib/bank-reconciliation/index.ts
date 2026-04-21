export { encrypt, decrypt } from "./encryption"
export {
  matchTransactions,
  normalizeForComparison,
  nameSimilarity,
  surnameMatches,
  nameContainedIn,
  findGroupCandidates,
  findSamePatientGroups,
  getSharedParent,
} from "./matcher"
export type { InvoiceWithParent } from "./matcher"
export { fetchStatements, fetchBalance, fetchScheduledPayments, extractPayerName } from "./inter-client"
export type { ScheduledPayment } from "./inter-client"
export type {
  TransactionForMatching,
  InvoiceForMatching,
  MatchConfidence,
  MatchCandidate,
  MatchResult,
} from "./types"
export type { InterConfig } from "./inter-client"
export { allocateGroupPayment, computeInvoiceStatus, computeSmartDefault } from "./reconciliation"
