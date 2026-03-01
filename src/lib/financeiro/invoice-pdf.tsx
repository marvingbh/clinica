import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  clinicName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 12, textAlign: "center" },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: 120, fontWeight: "bold" },
  infoValue: { flex: 1 },
  table: { marginTop: 16, marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: "bold",
  },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "center" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000",
    paddingTop: 4,
    marginTop: 4,
    fontWeight: "bold",
  },
  message: { marginTop: 20, lineHeight: 1.5 },
  footer: { marginTop: 30, fontSize: 8, color: "#666", textAlign: "center" },
})

export interface InvoicePDFData {
  clinicName: string
  clinicPhone?: string
  patientName: string
  professionalName: string
  referenceMonth: number
  referenceYear: number
  status: string
  dueDate: string
  totalAmount: string
  messageBody: string | null
  items: Array<{
    description: string
    quantity: number
    unitPrice: string
    total: string
    type: string
  }>
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/**
 * Creates a Document element suitable for renderToBuffer/renderToStream.
 * Use this in server-side API routes for PDF generation.
 *
 * The type assertion is needed because @react-pdf/renderer's renderToBuffer
 * expects ReactElement<DocumentProps> but the component wrapper returns
 * ReactElement<{ data: InvoicePDFData }>. At runtime, the component does
 * render a <Document> element which is what renderToBuffer needs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInvoiceDocument(data: InvoicePDFData): any {
  return React.createElement(InvoicePDF, { data })
}

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.clinicName}>{data.clinicName}</Text>
          {data.clinicPhone && <Text>{data.clinicPhone}</Text>}
        </View>

        <Text style={styles.title}>
          Fatura - {MONTH_NAMES[data.referenceMonth - 1]}/{data.referenceYear}
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Paciente:</Text>
          <Text style={styles.infoValue}>{data.patientName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Profissional:</Text>
          <Text style={styles.infoValue}>{data.professionalName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Vencimento:</Text>
          <Text style={styles.infoValue}>{data.dueDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status:</Text>
          <Text style={styles.infoValue}>
            {data.status === "PAGO" ? "Pago" : data.status === "ENVIADO" ? "Enviado" : data.status === "PENDENTE" ? "Pendente" : "Cancelado"}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Descricao</Text>
            <Text style={styles.colQty}>Qtd</Text>
            <Text style={styles.colPrice}>Valor Unit.</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {data.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{item.unitPrice}</Text>
              <Text style={styles.colTotal}>{item.total}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.colDesc}>Total</Text>
            <Text style={styles.colQty}></Text>
            <Text style={styles.colPrice}></Text>
            <Text style={styles.colTotal}>{data.totalAmount}</Text>
          </View>
        </View>

        {data.messageBody && (
          <View style={styles.message}>
            <Text>{data.messageBody}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Documento gerado automaticamente pelo sistema.</Text>
        </View>
      </Page>
    </Document>
  )
}
