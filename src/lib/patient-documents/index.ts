export {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  SOURCE_LABELS,
  type PatientDocumentSourceString,
  type PatientDocumentCategoryString,
  type PatientDocumentDTO,
} from "./types"

export {
  canViewDocument,
  canEditDocument,
  canDeleteDocument,
  visibleCategoriesFor,
  type DocumentViewer,
  type DocumentMeta,
  type DocumentSettings,
} from "./permissions"

export {
  TRASH_RETENTION_DAYS,
  ORPHAN_GRACE_HOURS,
  isPurgeEligible,
  purgeDeadline,
  findOrphanKeys,
} from "./lifecycle"

export {
  registerSystemDocument,
  type RegisterSystemDocumentInput,
  type PatientDocumentCreateDb,
} from "./register"

export {
  getClinicStorageUsage,
  type ClinicStorageUsage,
  type PatientDocumentAggregateDb,
} from "./usage"
