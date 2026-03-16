import React from "react"
import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer"
import type { DanfseData } from "./danfse-data-builder"

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const colors = {
  border: "#333",
  headerBg: "#e8e8e8",
  lightBg: "#f5f5f5",
  text: "#111",
  muted: "#555",
}

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: colors.text,
  },
  // Title
  title: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 9,
    textAlign: "center",
    color: colors.muted,
    marginBottom: 4,
  },
  // Sections
  sectionHeader: {
    backgroundColor: colors.headerBg,
    padding: 4,
    paddingLeft: 6,
    marginTop: 10,
    marginBottom: 4,
    fontWeight: "bold",
    fontSize: 9,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    marginBottom: 2,
    paddingHorizontal: 6,
  },
  label: {
    fontWeight: "bold",
    width: 130,
    fontSize: 8,
    color: colors.muted,
  },
  value: {
    flex: 1,
    fontSize: 9,
  },
  // Header info block (number, date, key)
  headerInfoBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  headerLabel: {
    fontWeight: "bold",
    fontSize: 8,
    color: colors.muted,
  },
  headerValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  // Description box
  descriptionBox: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginTop: 4,
    marginBottom: 8,
    minHeight: 60,
  },
  descriptionText: {
    fontSize: 9,
    lineHeight: 1.5,
  },
  // Totals
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: colors.lightBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "bold",
  },
  totalValue: {
    fontSize: 11,
    fontWeight: "bold",
  },
  // Tax table
  taxTableHeader: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 4,
  },
  taxTableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  taxCol: {
    flex: 1,
    textAlign: "center",
    fontSize: 8,
  },
  taxColHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: 7,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: colors.muted,
  },
  // Verification
  verificationBox: {
    marginTop: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: "center",
  },
  verificationLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: colors.muted,
    marginBottom: 3,
  },
  verificationUrl: {
    fontSize: 8,
    color: "#0066cc",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: "center",
  },
  footerText: {
    fontSize: 7,
    color: "#999",
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginVertical: 6,
  },
  // Value row (right-aligned value)
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
})

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

function DanfsePage({ data }: { data: DanfseData }) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Title */}
      <Text style={styles.title}>Nota Fiscal de Servicos Eletronica - NFS-e</Text>

      {/* Header info */}
      <View style={styles.headerInfoBlock}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerLabel}>Numero da Nota</Text>
            <Text style={styles.headerValue}>{data.nfseNumero}</Text>
          </View>
          <View>
            <Text style={styles.headerLabel}>Data da Emissao</Text>
            <Text style={styles.headerValue}>{data.dataEmissao}</Text>
          </View>
          <View>
            <Text style={styles.headerLabel}>Codigo de Verificacao</Text>
            <Text style={styles.headerValue}>{data.codigoVerificacao}</Text>
          </View>
        </View>
      </View>

      {/* Prestador */}
      <Text style={styles.sectionHeader}>Prestador de Servicos</Text>
      <InfoRow label="Razao Social:" value={data.prestadorRazaoSocial} />
      <InfoRow label="CNPJ:" value={data.prestadorCnpj} />
      <InfoRow label="Endereco:" value={data.prestadorEndereco} />
      {data.prestadorBairro ? <InfoRow label="Bairro:" value={data.prestadorBairro} /> : null}
      {data.prestadorCep ? <InfoRow label="CEP:" value={data.prestadorCep} /> : null}
      <InfoRow label="Inscricao Municipal:" value={data.prestadorInscricaoMunicipal} />
      <InfoRow label="Municipio/UF:" value={data.prestadorMunicipioUf} />
      {data.prestadorTelefone ? <InfoRow label="Telefone:" value={data.prestadorTelefone} /> : null}
      {data.prestadorEmail ? <InfoRow label="E-mail:" value={data.prestadorEmail} /> : null}

      {/* Tomador */}
      <Text style={styles.sectionHeader}>Tomador de Servicos</Text>
      <InfoRow label="Nome / Razao Social:" value={data.tomadorNome} />
      <InfoRow label="CPF / CNPJ:" value={data.tomadorCpfCnpj} />
      {data.tomadorEndereco ? <InfoRow label="Endereco:" value={data.tomadorEndereco} /> : null}
      {data.tomadorBairro ? <InfoRow label="Bairro:" value={data.tomadorBairro} /> : null}
      {data.tomadorCep ? <InfoRow label="CEP:" value={data.tomadorCep} /> : null}
      {data.tomadorMunicipioUf ? <InfoRow label="Municipio/UF:" value={data.tomadorMunicipioUf} /> : null}

      {/* Discriminacao dos servicos */}
      <Text style={styles.sectionHeader}>Discriminacao dos Servicos</Text>
      <View style={styles.descriptionBox}>
        <Text style={styles.descriptionText}>{data.descricao}</Text>
      </View>

      {/* Valor liquido */}
      <View style={styles.valueRow}>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>Valor liquido da Nota Fiscal</Text>
        <Text style={{ fontWeight: "bold", fontSize: 9 }}>{data.valorLiquido}</Text>
      </View>

      {/* Valor total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>VALOR TOTAL DA NOTA</Text>
        <Text style={styles.totalValue}>{data.valorTotal}</Text>
      </View>

      {/* Atividade */}
      <Text style={styles.sectionHeader}>Codigo da Atividade</Text>
      {data.cnae ? (
        <InfoRow label="CNAE:" value={data.cnaeDescricao ? `${data.cnae} - ${data.cnaeDescricao}` : data.cnae} />
      ) : null}
      <InfoRow label="Item de Servico:" value={data.cTribNac} />

      {/* Tax table */}
      <View style={styles.taxTableHeader}>
        <Text style={styles.taxColHeader}>Base de Calculo (R$)</Text>
        <Text style={styles.taxColHeader}>Aliquota ISS (%)</Text>
        <Text style={styles.taxColHeader}>Valor do ISS (R$)</Text>
      </View>
      <View style={styles.taxTableRow}>
        <Text style={styles.taxCol}>{data.baseCalculo}</Text>
        <Text style={styles.taxCol}>{data.aliquotaIss}</Text>
        <Text style={styles.taxCol}>{data.valorIss}</Text>
      </View>

      {/* Verification URL */}
      <View style={styles.verificationBox}>
        <Text style={styles.verificationLabel}>Verificar autenticidade em:</Text>
        <Link src={data.verificacaoUrl}>
          <Text style={styles.verificationUrl}>{data.verificacaoUrl}</Text>
        </Link>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Documento Auxiliar da NFS-e gerado pelo sistema. Consulte a autenticidade no portal nacional.
        </Text>
      </View>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDanfseDocument(data: DanfseData): any {
  return React.createElement(DanfsePDF, { data })
}

function DanfsePDF({ data }: { data: DanfseData }) {
  return (
    <Document>
      <DanfsePage data={data} />
    </Document>
  )
}
