import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { SignaturePageData } from "./signature-page"

const PAGE_WIDTH = 595.28 // A4 points
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const LINE_HEIGHT = 16
const TITLE_SIZE = 16
const BODY_SIZE = 10

/**
 * Appends a signature/evidence page to an existing PDF using pdf-lib (the only
 * way to append to an existing document — @react-pdf only creates new ones).
 *
 * Returns NEW bytes; the input buffer is not mutated. Long hash/text lines are
 * wrapped so they never overflow the page.
 */
export async function appendSignaturePage(
  originalPdf: Uint8Array,
  data: SignaturePageData
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalPdf)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  const maxWidth = PAGE_WIDTH - MARGIN * 2

  const ensureSpace = () => {
    if (y < MARGIN + LINE_HEIGHT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? BODY_SIZE
    const f = opts?.bold ? fontBold : font
    for (const line of wrap(text, f, size, maxWidth)) {
      ensureSpace()
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.1, 0.1, 0.1) })
      y -= LINE_HEIGHT
    }
  }

  draw(data.title, { bold: true, size: TITLE_SIZE })
  y -= LINE_HEIGHT / 2
  draw(data.clinicLine)
  draw(data.documentLine)
  draw(data.verificationLine, { bold: true })
  draw(data.hashLine)
  draw(data.countersignLine)
  y -= LINE_HEIGHT / 2

  draw("Signatários", { bold: true, size: 12 })
  for (const block of data.signerBlocks) {
    y -= LINE_HEIGHT / 2
    for (const line of block) draw(line)
  }

  y -= LINE_HEIGHT
  draw(data.legalNote, { size: 9 })

  return pdf.save()
}

/** Wraps a string to fit `maxWidth` at the given font/size. */
function wrap(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  // Hard-wrap very long unbroken tokens (hashes) by characters; otherwise wrap by words.
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
    } else {
      // break the long token
      let chunk = ""
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
          chunk += ch
        } else {
          lines.push(chunk)
          chunk = ch
        }
      }
      current = chunk
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [""]
}
