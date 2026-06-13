import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { FormAnswers, FormField } from "../types"
import { getVisibleFields } from "../visibility"
import { FORM_STATUS_LABELS } from "../status"
import type { FormResponseStatus } from "@prisma/client"

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#111" },
  clinicName: { fontSize: 13, fontWeight: "bold" },
  title: { fontSize: 14, fontWeight: "bold", marginTop: 12, marginBottom: 4 },
  meta: { fontSize: 9, color: "#555", marginBottom: 14 },
  section: { fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingBottom: 2 },
  label: { fontSize: 10, fontWeight: "bold", marginTop: 8 },
  answer: { fontSize: 10, color: "#222", marginTop: 2 },
  empty: { fontSize: 10, color: "#999", fontStyle: "italic", marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#999", textAlign: "center" },
})

export interface ResponsePdfData {
  clinicName: string
  templateName: string
  version: number
  patientName: string
  status: FormResponseStatus
  completedAtLabel: string | null
  fields: FormField[]
  answers: FormAnswers
}

function formatAnswer(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return ""
  if (field.type === "yes_no" || field.type === "info_consent") {
    return value === true ? "Sim" : "Não"
  }
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

function ResponseBody({ data }: { data: ResponsePdfData }) {
  // Only render the fields the patient actually saw (visible under their answers).
  const visible = getVisibleFields(data.fields, data.answers)
  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.clinicName}>{data.clinicName}</Text>
      <Text style={styles.title}>{data.templateName} (v{data.version})</Text>
      <Text style={styles.meta}>
        Paciente: {data.patientName} • Status: {FORM_STATUS_LABELS[data.status]}
        {data.completedAtLabel ? ` • Concluído em ${data.completedAtLabel}` : ""}
      </Text>

      {visible.map((field) => {
        if (field.type === "section") {
          return <Text key={field.id} style={styles.section}>{field.label}</Text>
        }
        const answer = formatAnswer(field, data.answers[field.id])
        return (
          <View key={field.id} wrap={false}>
            <Text style={styles.label}>{field.label}</Text>
            {answer ? <Text style={styles.answer}>{answer}</Text> : <Text style={styles.empty}>(sem resposta)</Text>}
          </View>
        )
      })}

      <Text style={styles.footer} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
    </Page>
  )
}

/** Creates a Document element suitable for renderToBuffer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createResponseDocument(data: ResponsePdfData): any {
  return React.createElement(Document, {}, React.createElement(ResponseBody, { data }))
}
