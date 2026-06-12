import React from "react"
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import type { SessionRow } from "./types"

const colors = {
  text: "#111",
  muted: "#555",
  border: "#333",
  headerBg: "#e8e8e8",
  lightBg: "#f5f5f5",
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
    color: colors.text,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  logo: { width: 140, height: "auto", maxHeight: 60 },
  clinicName: { fontSize: 13, fontWeight: "bold", color: colors.text },
  clinicDetail: { fontSize: 8, color: colors.muted },
  title: { fontSize: 14, fontWeight: "bold", textAlign: "center", marginTop: 12, marginBottom: 16, textTransform: "uppercase" },
  paragraph: { marginBottom: 8, textAlign: "justify" },
  // Session table
  table: { marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  tableHeader: { flexDirection: "row", backgroundColor: colors.headerBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#bbb" },
  th: { fontSize: 9, fontWeight: "bold", padding: 4 },
  td: { fontSize: 9, padding: 4 },
  colDate: { width: "40%" },
  colDuration: { width: "30%" },
  colValue: { width: "30%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 6, paddingHorizontal: 4, backgroundColor: colors.lightBg },
  totalLabel: { fontSize: 11, fontWeight: "bold", marginRight: 12 },
  totalValue: { fontSize: 11, fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
  generatedAt: { fontSize: 8, color: "#999", marginTop: 16 },
})

export interface DocumentPDFData {
  clinicName: string
  clinicAddress?: string | null
  clinicPhone?: string | null
  /** data URI of Clinic.logoData; no file fallback (clinic without logo => name only). */
  logoSrc?: string | null
  title: string
  paragraphsBefore: string[]
  sessionRows: SessionRow[] | null
  totalValue: string | null
  paragraphsAfter: string[]
  generatedAtLabel: string
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <>
      {items.map((p, i) =>
        p.trim().length === 0 ? (
          <View key={i} style={{ height: 6 }} />
        ) : (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        )
      )}
    </>
  )
}

function SessionTable({ rows, totalValue }: { rows: SessionRow[]; totalValue: string | null }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, styles.colDate]}>Data</Text>
        <Text style={[styles.th, styles.colDuration]}>Duração</Text>
        <Text style={[styles.th, styles.colValue]}>Valor</Text>
      </View>
      {rows.map((r) => (
        <View key={r.invoiceItemId} style={styles.tableRow} wrap={false}>
          <Text style={[styles.td, styles.colDate]}>{r.date}</Text>
          <Text style={[styles.td, styles.colDuration]}>{r.durationMinutes} min</Text>
          <Text style={[styles.td, styles.colValue]}>{r.unitPrice}</Text>
        </View>
      ))}
      {totalValue && (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{totalValue}</Text>
        </View>
      )}
    </View>
  )
}

function DocumentBody({ data }: { data: DocumentPDFData }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header} fixed>
        <View>
          {data.logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.logo} src={data.logoSrc} />
          ) : (
            <Text style={styles.clinicName}>{data.clinicName}</Text>
          )}
          {data.clinicPhone ? <Text style={styles.clinicDetail}>{data.clinicPhone}</Text> : null}
          {data.clinicAddress ? <Text style={styles.clinicDetail}>{data.clinicAddress}</Text> : null}
        </View>
      </View>

      <Text style={styles.title}>{data.title}</Text>

      <Paragraphs items={data.paragraphsBefore} />

      {data.sessionRows && data.sessionRows.length > 0 && (
        <SessionTable rows={data.sessionRows} totalValue={data.totalValue} />
      )}

      <Paragraphs items={data.paragraphsAfter} />

      <Text style={styles.generatedAt}>{data.generatedAtLabel}</Text>

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        fixed
      />
    </Page>
  )
}

/** Creates a Document element suitable for renderToBuffer/renderToStream. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGeneratedDocument(data: DocumentPDFData): any {
  return React.createElement(Document, {}, React.createElement(DocumentBody, { data }))
}
