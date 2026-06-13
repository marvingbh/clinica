import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
    color: "#111",
  },
  clinicName: { fontSize: 13, fontWeight: "bold" },
  title: { fontSize: 14, fontWeight: "bold", marginTop: 12, marginBottom: 4 },
  meta: { fontSize: 9, color: "#555", marginBottom: 14 },
  section: { fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 4 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingVertical: 4 },
  cellDate: { width: "30%", fontSize: 10 },
  cellScore: { width: "20%", fontSize: 10 },
  cellSeverity: { width: "35%", fontSize: 10 },
  cellSource: { width: "15%", fontSize: 10 },
  bar: { backgroundColor: "#2563eb", height: 8, borderRadius: 2 },
  barRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  barLabel: { width: "22%", fontSize: 8, color: "#555" },
  barTrack: { width: "60%", backgroundColor: "#eee", height: 8, borderRadius: 2 },
  barValue: { width: "18%", fontSize: 8, color: "#555", textAlign: "right" },
  empty: { fontSize: 10, color: "#999", fontStyle: "italic", marginTop: 8 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
})

export interface ScalePdfRow {
  dateLabel: string
  totalScore: number
  severityLabel: string
  sourceLabel: string
}

export interface ScalePdfData {
  clinicName: string
  patientName: string
  scaleName: string
  maxScore: number
  rows: ScalePdfRow[]
}

function TrajectoryBody({ data }: { data: ScalePdfData }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.clinicName}>{data.clinicName}</Text>
      <Text style={styles.title}>{data.scaleName} — Trajetória</Text>
      <Text style={styles.meta}>Paciente: {data.patientName}</Text>

      {data.rows.length === 0 ? (
        <Text style={styles.empty}>Nenhuma administração concluída.</Text>
      ) : (
        <>
          <Text style={styles.section}>Administrações</Text>
          <View style={styles.headerRow}>
            <Text style={styles.cellDate}>Data</Text>
            <Text style={styles.cellScore}>Pontuação</Text>
            <Text style={styles.cellSeverity}>Severidade</Text>
            <Text style={styles.cellSource}>Origem</Text>
          </View>
          {data.rows.map((r, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.cellDate}>{r.dateLabel}</Text>
              <Text style={styles.cellScore}>
                {r.totalScore}/{data.maxScore}
              </Text>
              <Text style={styles.cellSeverity}>{r.severityLabel}</Text>
              <Text style={styles.cellSource}>{r.sourceLabel}</Text>
            </View>
          ))}

          <Text style={styles.section}>Evolução</Text>
          {data.rows.map((r, i) => (
            <View key={i} style={styles.barRow} wrap={false}>
              <Text style={styles.barLabel}>{r.dateLabel}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.bar, { width: `${Math.round((r.totalScore / data.maxScore) * 100)}%` }]}
                />
              </View>
              <Text style={styles.barValue}>{r.totalScore}</Text>
            </View>
          ))}
        </>
      )}

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        fixed
      />
    </Page>
  )
}

/** Creates a Document element for renderToBuffer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTrajectoryDocument(data: ScalePdfData): any {
  return (
    <Document>
      <TrajectoryBody data={data} />
    </Document>
  )
}
