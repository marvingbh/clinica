import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { RecordExportEntry } from "./record-export"

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.5, color: "#111" },
  title: { fontSize: 15, fontWeight: "bold", marginBottom: 4, textAlign: "center" },
  clinic: { fontSize: 11, marginBottom: 12, textAlign: "center", color: "#333" },
  metaBox: { marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #ccc" },
  metaLine: { marginBottom: 2 },
  metaLabel: { fontWeight: "bold" },
  confidential: { fontSize: 8, color: "#666", marginTop: 6, fontStyle: "italic" },
  entry: { marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #eee" },
  entryHeader: { fontSize: 11, fontWeight: "bold", marginBottom: 6 },
  section: { marginBottom: 6 },
  sectionLabel: { fontWeight: "bold", color: "#222" },
  addendum: { marginTop: 6, paddingLeft: 10, borderLeft: "2px solid #ddd", color: "#333" },
  addendumMeta: { fontSize: 8, color: "#666", marginBottom: 1 },
  signLine: { fontSize: 8, color: "#555", marginTop: 6 },
  hash: { fontSize: 7, color: "#888", fontFamily: "Courier" },
  empty: { marginTop: 24, textAlign: "center", color: "#666" },
  footer: {
    position: "absolute", bottom: 24, left: 48, right: 48,
    fontSize: 8, color: "#999", textAlign: "center",
  },
})

function fmtDate(value: Date | string | null): string {
  if (!value) return ""
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtDateTime(value: Date | string | null): string {
  if (!value) return ""
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export interface RecordExportDocumentProps {
  clinicName: string
  patientName: string
  generatedAt: Date | string
  generatedByName: string | null
  entries: RecordExportEntry[]
}

/**
 * Patient prontuário export — chronological signed evoluções with sections,
 * addenda, signing metadata, and content hashes for integrity. Consumes the
 * pure RecordExportEntry[] from buildRecordExportEntries.
 */
export function RecordExportDocument({
  clinicName,
  patientName,
  generatedAt,
  generatedByName,
  entries,
}: RecordExportDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Prontuário Psicológico</Text>
        <Text style={styles.clinic}>{clinicName}</Text>

        <View style={styles.metaBox}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Paciente: </Text>
            {patientName}
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Emitido em: </Text>
            {fmtDateTime(generatedAt)}
          </Text>
          {generatedByName && (
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Emitido por: </Text>
              {generatedByName}
            </Text>
          )}
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Registros assinados: </Text>
            {entries.length}
          </Text>
          <Text style={styles.confidential}>
            Documento sigiloso. Contém registros clínicos protegidos pelo sigilo profissional
            (Código de Ética do Psicólogo) e pela LGPD. Uso restrito ao titular ou a quem ele autorizar.
          </Text>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.empty}>Nenhum registro assinado para exportar.</Text>
        ) : (
          entries.map((entry, i) => (
            <View key={i} style={styles.entry} wrap={false}>
              <Text style={styles.entryHeader}>
                Sessão de {fmtDate(entry.sessionDate)} — {entry.typeLabel} ({entry.formatLabel})
              </Text>
              {entry.sections.map((s, j) => (
                <View key={j} style={styles.section}>
                  <Text>
                    <Text style={styles.sectionLabel}>{s.label}: </Text>
                    {s.text}
                  </Text>
                </View>
              ))}
              {entry.addenda.map((a, k) => (
                <View key={k} style={styles.addendum}>
                  <Text style={styles.addendumMeta}>
                    Adendo — {fmtDateTime(a.createdAt)}
                    {a.authorName ? ` • ${a.authorName}` : ""}
                  </Text>
                  <Text>{a.content}</Text>
                </View>
              ))}
              {entry.signedByName && (
                <Text style={styles.signLine}>
                  Assinado por {entry.signedByName} em {fmtDateTime(entry.signedAt)}
                </Text>
              )}
              {entry.contentHash && <Text style={styles.hash}>SHA-256: {entry.contentHash}</Text>}
            </View>
          ))
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
