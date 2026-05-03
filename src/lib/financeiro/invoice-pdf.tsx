import React from "react"
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import path from "path"
import type { InvoiceItemType } from "@prisma/client"

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  clinicInfo: { flex: 1 },
  logo: { width: 160, height: "auto", marginBottom: 6 },
  clinicName: { fontSize: 16, fontWeight: "bold", marginBottom: 2 },
  clinicDetail: { fontSize: 9, color: "#555", marginBottom: 1 },
  reportLabel: { fontSize: 12, fontWeight: "bold", textAlign: "right", color: "#333" },
  reportDate: { fontSize: 9, color: "#555", textAlign: "right", marginTop: 2 },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: "#ccc", marginVertical: 12 },
  dividerBold: { borderBottomWidth: 2, borderBottomColor: "#333", marginVertical: 12 },
  // Invoice info
  infoGrid: { flexDirection: "row", marginBottom: 16 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 10, fontWeight: "bold" },
  infoItem: { marginBottom: 8 },
  // Table
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    fontWeight: "bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: "#555",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  colDate: { width: 50 },
  colDesc: { flex: 4 },
  colPrice: { width: 60, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  sectionHeaderRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    marginTop: 4,
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#333",
    textTransform: "uppercase",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: "#f5f5f5",
    fontWeight: "bold",
  },
  // Summary
  summaryBox: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 16 },
  summaryInner: { width: 200 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  summaryLabel: { fontSize: 9, color: "#555" },
  summaryValue: { fontSize: 9 },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#333",
    marginTop: 4,
  },
  summaryTotalLabel: { fontSize: 11, fontWeight: "bold" },
  summaryTotalValue: { fontSize: 11, fontWeight: "bold" },
  // Payment info
  paymentBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
  },
  paymentTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 6, textTransform: "uppercase", color: "#555" },
  paymentText: { fontSize: 9, color: "#333", lineHeight: 1.5 },
  // Footer
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center" },
  footerText: { fontSize: 7, color: "#999" },
})

export interface InvoicePDFItem {
  description: string
  date?: string
  quantity: number
  unitPrice: string
  total: string
  type: InvoiceItemType
}

export interface InvoicePDFItemSection {
  /** When non-null, render a section divider row with this label. */
  header: string | null
  items: InvoicePDFItem[]
}

export interface InvoicePDFData {
  clinicName: string
  clinicPhone?: string
  clinicEmail?: string
  clinicAddress?: string
  logoSrc?: string
  patientName: string
  professionalName: string
  /**
   * Label for the professional row in the header.
   * "Técnico de referência" when the patient has one,
   * "Profissional" when single attending without reference,
   * null when multi-attending without reference (row omitted).
   */
  referenceProfessionalLabel?: string | null
  /** Name shown next to the label, or null to omit the row. */
  referenceProfessionalName?: string | null
  referenceMonth: number
  referenceYear: number
  status: string
  dueDate: string
  totalAmount: string
  totalSessions: number
  creditsApplied: number
  paymentInfo?: string | null
  itemSections: InvoicePDFItemSection[]
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const STATUS_LABELS: Record<string, string> = {
  PAGO: "Pago",
  PARCIAL: "Parcial",
  ENVIADO: "Enviado",
  PENDENTE: "Pendente",
  CANCELADO: "Cancelado",
}

/**
 * Creates a Document element suitable for renderToBuffer/renderToStream.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInvoiceDocument(data: InvoicePDFData): any {
  return React.createElement(InvoicePDF, { data })
}

/**
 * Creates a multi-page Document with one page per invoice (for grouped PER_SESSION downloads).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGroupedInvoiceDocument(dataArray: InvoicePDFData[]): any {
  return React.createElement(GroupedInvoicePDF, { dataArray })
}

function InvoicePage({ data }: { data: InvoicePDFData }) {
  const period = `${MONTH_NAMES[data.referenceMonth - 1]}/${data.referenceYear}`

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.clinicInfo}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={styles.logo} src={data.logoSrc || path.join(process.cwd(), "public/img/logo-elena-horizontal.png")} />
          {data.clinicPhone && <Text style={styles.clinicDetail}>{data.clinicPhone}</Text>}
          {data.clinicEmail && <Text style={styles.clinicDetail}>{data.clinicEmail}</Text>}
          {data.clinicAddress && <Text style={styles.clinicDetail}>{data.clinicAddress}</Text>}
        </View>
        <View>
          <Text style={styles.reportLabel}>RELATÓRIO FINANCEIRO</Text>
          <Text style={styles.reportDate}>{period}</Text>
        </View>
      </View>

      <View style={styles.dividerBold} />

      {/* Invoice Info Grid */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCol}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Paciente</Text>
            <Text style={styles.infoValue}>{data.patientName}</Text>
          </View>
          {data.referenceProfessionalLabel && data.referenceProfessionalName && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{data.referenceProfessionalLabel}</Text>
              <Text style={styles.infoValue}>{data.referenceProfessionalName}</Text>
            </View>
          )}
        </View>
        <View style={styles.infoCol}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Período</Text>
            <Text style={styles.infoValue}>{period}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Vencimento</Text>
            <Text style={styles.infoValue}>{data.dueDate}</Text>
          </View>
        </View>
        <View style={styles.infoCol}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{STATUS_LABELS[data.status] || data.status}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Items Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colDate}>Data</Text>
          <Text style={styles.colDesc}>Descrição</Text>
          <Text style={styles.colPrice}>Valor Unit.</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>
        {data.itemSections.flatMap((section, sIdx) => {
          const rows = []
          if (section.header) {
            rows.push(
              <View key={`section-${sIdx}`} style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderText}>{section.header}</Text>
              </View>,
            )
          }
          section.items.forEach((item, idx) => {
            rows.push(
              <View key={`row-${sIdx}-${idx}`} style={styles.tableRow}>
                <Text style={styles.colDate}>{item.date || "—"}</Text>
                <Text style={styles.colDesc}>{item.description}</Text>
                <Text style={styles.colPrice}>{item.unitPrice}</Text>
                <Text style={styles.colTotal}>{item.total}</Text>
              </View>,
            )
          })
          return rows
        })}
      </View>

      {/* Summary */}
      <View style={styles.summaryBox}>
        <View style={styles.summaryInner}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total de sessões</Text>
            <Text style={styles.summaryValue}>{data.totalSessions}</Text>
          </View>
          {data.creditsApplied > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Créditos aplicados</Text>
              <Text style={styles.summaryValue}>{data.creditsApplied}</Text>
            </View>
          )}
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{data.totalAmount}</Text>
          </View>
        </View>
      </View>

      {/* Payment Info */}
      {data.paymentInfo && (
        <View style={styles.paymentBox}>
          <Text style={styles.paymentTitle}>Dados para Pagamento</Text>
          <Text style={styles.paymentText}>{data.paymentInfo}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Documento gerado automaticamente pelo sistema.
        </Text>
      </View>
    </Page>
  )
}

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  return (
    <Document>
      <InvoicePage data={data} />
    </Document>
  )
}

function GroupedInvoicePDF({ dataArray }: { dataArray: InvoicePDFData[] }) {
  return (
    <Document>
      {dataArray.map((data, idx) => (
        <InvoicePage key={idx} data={data} />
      ))}
    </Document>
  )
}
