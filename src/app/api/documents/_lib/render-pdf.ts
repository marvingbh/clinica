import { renderToBuffer } from "@react-pdf/renderer"
import {
  createGeneratedDocument,
  splitContentBySessionTable,
  sumSessionRows,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type SessionRow,
  type DocumentPDFData,
} from "@/lib/documents"

export interface RenderInput {
  templateType: DocumentType
  content: string
  sessionRows: SessionRow[]
  clinicName: string
  clinicAddress: string | null
  clinicPhone: string | null
  clinicLogo: { data: Buffer | null; mime: string | null }
  generatedAt: Date
  timezone: string
}

/** Turn merged content into DocumentPDFData and render to a PDF buffer. */
export async function renderDocumentPdf(input: RenderInput): Promise<Buffer> {
  const split = splitContentBySessionTable(input.content)
  const hasTable = split.hasTable && input.sessionRows.length > 0

  const logoSrc =
    input.clinicLogo.data && input.clinicLogo.mime
      ? `data:${input.clinicLogo.mime};base64,${input.clinicLogo.data.toString("base64")}`
      : null

  const generatedDate = input.generatedAt.toLocaleDateString("pt-BR", {
    timeZone: input.timezone, day: "2-digit", month: "2-digit", year: "numeric",
  })
  const generatedTime = input.generatedAt.toLocaleTimeString("pt-BR", {
    timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  })

  const data: DocumentPDFData = {
    clinicName: input.clinicName,
    clinicAddress: input.clinicAddress,
    clinicPhone: input.clinicPhone,
    logoSrc,
    title: DOCUMENT_TYPE_LABELS[input.templateType],
    paragraphsBefore: toParagraphs(split.before),
    sessionRows: hasTable ? input.sessionRows : null,
    totalValue: hasTable ? sumSessionRows(input.sessionRows) : null,
    paragraphsAfter: hasTable ? toParagraphs(split.after) : [],
    generatedAtLabel: `Gerado em ${generatedDate} às ${generatedTime}`,
  }

  const buf = await renderToBuffer(createGeneratedDocument(data))
  return Buffer.from(buf)
}

function toParagraphs(text: string): string[] {
  return text.split("\n")
}

/** Safe filename for Content-Disposition. */
export function documentFileName(title: string): string {
  return `${title.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")}.pdf`
}
