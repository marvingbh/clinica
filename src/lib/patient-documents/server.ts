// Server-only patient-documents entry point. Pulls in @react-pdf/renderer,
// prisma, and the storage provider — never import from a client component.

export {
  archiveFormResponseAsDocument,
  type FormResponseForArchive,
} from "./archive-form"
