import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { buildNfseDescription } from "@/lib/nfse/description-builder"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer"

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
})

const s = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 16 },
  table: { width: "100%" },
  headerRow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderColor: "#e5e7eb", paddingVertical: 6 },
  headerCell: { fontSize: 7, fontWeight: "bold", color: "#6b7280", textTransform: "uppercase" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 5, minHeight: 20 },
  rowAlt: { backgroundColor: "#fafafa" },
  cell: { fontSize: 7.5, color: "#1f2937" },
  cellMuted: { fontSize: 7, color: "#9ca3af" },
  colPatient: { width: "12%", paddingHorizontal: 4 },
  colResponsavel: { width: "12%", paddingHorizontal: 2 },
  colSessions: { width: "5%", paddingHorizontal: 2, textAlign: "center" },
  colCredits: { width: "5%", paddingHorizontal: 2, textAlign: "center" },
  colTotal: { width: "7%", paddingHorizontal: 2, textAlign: "right" },
  colObs: { width: "12%", paddingHorizontal: 4 },
  colDesc: { width: "47%", paddingHorizontal: 4 },
  footer: { marginTop: 12, fontSize: 7, color: "#9ca3af" },
})

interface PreviewRow {
  patientName: string
  professionalName: string
  responsavelNome: string
  responsavelCpf: string | null
  sessions: number
  credits: number
  totalAmount: number
  nfseObs: string | null
  dayOfWeek: number | null
  descricao: string
}

function formatBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`
}

function PreviewDocument({ rows, month, year }: { rows: PreviewRow[]; month: number; year: number }) {
  return React.createElement(Document, {},
    React.createElement(Page, { size: "A4", orientation: "landscape", style: s.page },
      React.createElement(Text, { style: s.title }, `Preview NFS-e`),
      React.createElement(Text, { style: s.subtitle }, `${MONTH_NAMES[month - 1]} ${year} — ${rows.length} fatura(s)`),
      React.createElement(View, { style: s.table },
        // Header
        React.createElement(View, { style: s.headerRow },
          React.createElement(Text, { style: { ...s.headerCell, ...s.colPatient } }, "Paciente"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colResponsavel } }, "Responsável"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colSessions } }, "Sessões"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colCredits } }, "Créditos"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colTotal } }, "Total"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colObs } }, "Obs. NFS-e"),
          React.createElement(Text, { style: { ...s.headerCell, ...s.colDesc } }, "Descrição NFS-e"),
        ),
        // Rows
        ...rows.map((row, i) =>
          React.createElement(View, { key: i, style: { ...s.row, ...(i % 2 === 1 ? s.rowAlt : {}) }, wrap: false },
            React.createElement(View, { style: s.colPatient },
              React.createElement(Text, { style: s.cell }, row.patientName),
              React.createElement(Text, { style: s.cellMuted }, row.professionalName),
            ),
            React.createElement(View, { style: s.colResponsavel },
              React.createElement(Text, { style: s.cell }, row.responsavelNome),
              React.createElement(Text, { style: s.cellMuted }, row.responsavelCpf || ""),
            ),
            React.createElement(Text, { style: { ...s.cell, ...s.colSessions } }, String(row.sessions)),
            React.createElement(Text, { style: { ...s.cell, ...s.colCredits } }, row.credits > 0 ? String(row.credits) : "—"),
            React.createElement(Text, { style: { ...s.cell, ...s.colTotal } }, formatBRL(row.totalAmount)),
            React.createElement(Text, { style: { ...s.cell, ...s.colObs } }, row.nfseObs || "—"),
            React.createElement(Text, { style: { ...s.cell, ...s.colDesc } }, row.descricao),
          )
        ),
      ),
      React.createElement(Text, { style: s.footer }, `Gerado em ${new Date().toLocaleDateString("pt-BR")}`)
    )
  )
}

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const month = Number(url.searchParams.get("month"))
    const year = Number(url.searchParams.get("year"))

    const invoiceIdsParam = url.searchParams.get("invoiceIds")

    if (!month || !year) {
      return NextResponse.json({ error: "Mês e ano são obrigatórios" }, { status: 400 })
    }

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceMonth: month,
      referenceYear: year,
      status: { notIn: ["CANCELADO"] },
    }
    if (invoiceIdsParam) {
      where.id = { in: invoiceIdsParam.split(",").filter(Boolean) }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: {
          select: {
            name: true, billingResponsibleName: true, billingCpf: true, cpf: true,
            sessionFee: true, nfseDescriptionTemplate: true, nfseObs: true,
          },
        },
        professionalProfile: {
          select: { registrationNumber: true, user: { select: { name: true } } },
        },
        clinic: { include: { nfseConfig: true } },
        items: {
          include: { appointment: { select: { scheduledAt: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ professionalProfile: { user: { name: "asc" } } }, { patient: { name: "asc" } }],
    })

    const nfseConfig = invoices[0]?.clinic?.nfseConfig

    const rows: PreviewRow[] = invoices.map((inv) => {
      const sessionItems = inv.items.filter(i => i.type !== "CREDITO")
      const creditItems = inv.items.filter(i => i.type === "CREDITO")
      const sessionDates = sessionItems
        .filter(i => i.appointment?.scheduledAt)
        .map(i => new Date(i.appointment!.scheduledAt))

      const template = inv.patient.nfseDescriptionTemplate || nfseConfig?.descricaoServico || null

      const descricao = buildNfseDescription({
        patientName: inv.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
        billingResponsibleName: inv.patient.billingResponsibleName,
        professionalName: inv.professionalProfile.user.name,
        professionalCrp: inv.professionalProfile.registrationNumber || nfseConfig?.professionalCrp || undefined,
        referenceMonth: inv.referenceMonth,
        referenceYear: inv.referenceYear,
        sessionDates,
        sessionFee: Number(inv.patient.sessionFee || inv.totalAmount),
        totalAmount: Number(inv.totalAmount),
        taxPercentage: nfseConfig?.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
      }, template)

      const firstDate = sessionDates.length > 0 ? sessionDates.sort((a, b) => a.getTime() - b.getTime())[0] : null
      const dayOfWeek = firstDate ? firstDate.getDay() : null

      return {
        patientName: inv.patient.name,
        professionalName: inv.professionalProfile.user.name,
        sessions: sessionItems.length,
        credits: creditItems.length,
        totalAmount: Number(inv.totalAmount),
        nfseObs: inv.patient.nfseObs,
        responsavelNome: inv.patient.billingResponsibleName || inv.patient.name,
        responsavelCpf: inv.patient.billingCpf || inv.patient.cpf || null,
        dayOfWeek,
        descricao,
      }
    })

    // Sort by professional, day of week, patient name
    rows.sort((a, b) => {
      const profCmp = a.professionalName.localeCompare(b.professionalName)
      if (profCmp !== 0) return profCmp
      const dayA = a.dayOfWeek ?? 7
      const dayB = b.dayOfWeek ?? 7
      if (dayA !== dayB) return dayA - dayB
      return a.patientName.localeCompare(b.patientName)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(PreviewDocument, { rows, month, year }) as any
    )

    const monthName = MONTH_NAMES[month - 1]
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="preview-nfse-${monthName}-${year}.pdf"`,
      },
    })
  }
)
