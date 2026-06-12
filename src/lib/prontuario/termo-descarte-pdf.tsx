import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { formatTermoDescarteLines, type TermoDescarteData } from "./descarte"

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5 },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  para: { marginBottom: 10 },
  hash: { fontSize: 8, color: "#555", fontFamily: "Courier" },
})

/**
 * Disposal-term PDF document. Consumes the pure pt-BR lines from
 * formatTermoDescarteLines so the legal copy stays testable.
 */
export function TermoDescarteDocument({ data }: { data: TermoDescarteData }) {
  const lines = formatTermoDescarteLines(data)
  const [title, ...rest] = lines
  const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <View>
          {rest.map((line, i) => (
            <Text key={i} style={isHash(line) ? styles.hash : styles.para}>
              {line}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}
