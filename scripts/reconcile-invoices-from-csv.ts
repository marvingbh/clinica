import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"

const prisma = new PrismaClient()

const CLINIC_ID = "cml48q60c0000nxitee84i1l2"
const MONTH = 2
const YEAR = 2026
const DUE_DATE = new Date(2026, 1, 15) // Feb 15, 2026

const PROF_MAP: Record<string, string> = {
  elena: "cml48q6d8000anxitnaq3b14q",
  cherlen: "cml48q6e9000cnxit6ycz9ern",
  livia: "cml48q6et000enxit0bkknht6",
}

const SKIP_NAMES = ["ATENDIMENTO CONJUNTO ARTHUR", "CATARINA DA AMANDA"]

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

function parseCurrency(raw: string): number {
  // Handles: "R$1,340.00", R$640.00, R$0.00, etc.
  const cleaned = raw.replace(/[R$",\s]/g, "").trim()
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : val
}

interface CSVPatientData {
  name: string
  motherName: string
  cobranca: number
  totalIndiv: number
  totalGrupo: number
  totalExtra: number
  pago: boolean
}

function parseCSV(filePath: string): CSVPatientData[] {
  const raw = readFileSync(filePath, "utf-8")
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""))

  const sectionHeaders = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "GRUPOS", "AVULSOS"]
  const patients: CSVPatientData[] = []
  // Track unique entries by name to avoid duplicates within CSV
  // (same patient can appear multiple times for different days)
  const seen = new Map<string, number>() // name -> index in patients array

  for (const line of lines) {
    const row = parseCSVLine(line)
    if (row.length < 20) continue

    const col0 = (row[0] || "").trim()
    const col1 = (row[1] || "").trim()

    if (sectionHeaders.includes(col0) || sectionHeaders.includes(col1)) continue
    if (col0 === "HORA" || col0 === "HORA QUE VEM") continue
    if (!col1 || col1 === "NOME") continue

    const col5 = (row[5] || "").trim()
    if (col5 === "DIAS DO MÊS" || col5 === "Status" || col5 === "INDIVIDUAIS") continue

    const cobrancaStr = (row[18] || "").trim()
    const cobranca = parseCurrency(cobrancaStr)

    const motherName = (row[2] || "").trim()
    const indiv = parseInt((row[19] || "0").trim()) || 0
    const grupo = parseInt((row[20] || "0").trim()) || 0
    const extra = parseInt((row[21] || "0").trim()) || 0
    const pagoStr = (row[23] || "").trim().toUpperCase()
    const pago = pagoStr === "TRUE"

    const normalizedName = normalize(col1)

    if (seen.has(normalizedName)) {
      // Same patient, different day section — accumulate
      const idx = seen.get(normalizedName)!
      patients[idx].cobranca += cobranca
      patients[idx].totalIndiv += indiv
      patients[idx].totalGrupo += grupo
      patients[idx].totalExtra += extra
      // Only PAGO if ALL rows say TRUE
      patients[idx].pago = patients[idx].pago && pago
    } else {
      seen.set(normalizedName, patients.length)
      patients.push({
        name: col1,
        motherName,
        cobranca,
        totalIndiv: indiv,
        totalGrupo: grupo,
        totalExtra: extra,
        pago,
      })
    }
  }

  return patients
}

function findMatch(
  csvName: string,
  csvMotherName: string,
  dbPatients: { id: string; name: string }[]
): { id: string; name: string } | undefined {
  const normalizedCsvName = normalize(csvName)

  const exactMatch = dbPatients.find((p) => {
    const dbNameBase = p.name.replace(/\s*\(.*\)\s*$/, "").trim()
    return normalize(dbNameBase) === normalizedCsvName
  })
  if (exactMatch) return exactMatch

  const normalizedCsvMother = normalize(csvMotherName)
  if (!normalizedCsvMother) return undefined

  const fallbackMatch = dbPatients.find((p) => {
    const parenMatch = p.name.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (parenMatch) {
      const dbBase = normalize(parenMatch[1])
      const dbMother = normalize(parenMatch[2])
      return normalizedCsvName.startsWith(dbBase) && dbMother === normalizedCsvMother
    } else {
      const dbBase = normalize(p.name)
      return normalizedCsvName.startsWith(dbBase) && dbBase.length > 0
    }
  })
  return fallbackMatch
}

function detectProfessional(filePath: string): string | null {
  const lower = filePath.toLowerCase()
  // planilha-fev-csv.csv is Elena's file
  if (lower.includes("planilha-fev-csv")) return PROF_MAP.elena
  for (const [key, profId] of Object.entries(PROF_MAP)) {
    if (lower.includes(key)) return profId
  }
  return null
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00A0/g, " ")
}

const DEFAULT_INVOICE_TEMPLATE = `Prezado(a) {{mae}},

Segue a fatura de {{paciente}} referente ao mês de {{mes}}/{{ano}}.

Valor: {{valor}}
Vencimento: {{vencimento}}
Total de sessões: {{sessoes}}

Atenciosamente,
{{profissional}}`

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

async function recalculateInvoiceTotals(invoiceId: string) {
  const items = await prisma.invoiceItem.findMany({ where: { invoiceId } })

  let totalSessions = 0
  let creditsApplied = 0
  let extrasAdded = 0
  let totalAmount = 0

  for (const it of items) {
    totalAmount += Number(it.total)
    if (it.type === "CREDITO") {
      creditsApplied++
    } else if (it.type === "SESSAO_EXTRA" || it.type === "REUNIAO_ESCOLA") {
      extrasAdded += it.quantity
      totalSessions += it.quantity
    } else {
      totalSessions += it.quantity
    }
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      patient: {
        select: {
          name: true, motherName: true, fatherName: true,
          invoiceMessageTemplate: true,
        },
      },
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })

  if (!invoice) return

  const clinic = await prisma.clinic.findUnique({
    where: { id: invoice.clinicId },
    select: { invoiceMessageTemplate: true },
  })

  const template = invoice.patient.invoiceMessageTemplate
    || clinic?.invoiceMessageTemplate
    || DEFAULT_INVOICE_TEMPLATE

  const messageBody = renderTemplate(template, {
    paciente: invoice.patient.name,
    mae: invoice.patient.motherName || "",
    pai: invoice.patient.fatherName || "",
    valor: formatCurrencyBRL(totalAmount),
    mes: MONTH_NAMES[MONTH - 1],
    ano: String(YEAR),
    vencimento: DUE_DATE.toLocaleDateString("pt-BR"),
    sessoes: String(totalSessions),
    profissional: invoice.professionalProfile.user.name,
  })

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { totalSessions, creditsApplied, extrasAdded, totalAmount, messageBody },
  })
}

async function main() {
  const files = [
    "/mnt/c/temp/planilha-fev-csv.csv",
    "/mnt/c/temp/planilha-fev-cherlen.csv",
    "/mnt/c/temp/planilha-fev-livia.csv",
  ]

  const dbPatients = await prisma.patient.findMany({
    where: { clinicId: CLINIC_ID },
    select: {
      id: true, name: true, motherName: true, fatherName: true,
      sessionFee: true, showAppointmentDaysOnInvoice: true,
      invoiceMessageTemplate: true,
    },
  })

  const profProfiles = await prisma.professionalProfile.findMany({
    where: { id: { in: Object.values(PROF_MAP) } },
    select: { id: true, user: { select: { name: true } } },
  })
  const profNameMap = new Map(profProfiles.map(p => [p.id, p.user.name]))

  const clinic = await prisma.clinic.findUnique({
    where: { id: CLINIC_ID },
    select: { invoiceMessageTemplate: true },
  })

  let totalCreated = 0
  let totalAdjusted = 0
  let totalSkipped = 0
  let totalNoMatch = 0

  for (const filePath of files) {
    const profId = detectProfessional(filePath)
    if (!profId) {
      console.error(`Could not detect professional from: ${filePath}`)
      continue
    }

    const profName = profNameMap.get(profId) || "Unknown"
    console.log(`\n=== ${profName} (${filePath}) ===\n`)

    const csvPatients = parseCSV(filePath)

    for (const csvPat of csvPatients) {
      if (SKIP_NAMES.includes(csvPat.name.toUpperCase())) {
        console.log(`  SKIP: ${csvPat.name}`)
        totalSkipped++
        continue
      }

      if (csvPat.cobranca === 0) {
        console.log(`  SKIP (R$0): ${csvPat.name}`)
        totalSkipped++
        continue
      }

      const match = findMatch(csvPat.name, csvPat.motherName, dbPatients)
      if (!match) {
        console.log(`  NO MATCH: ${csvPat.name} (${csvPat.motherName}) → ${formatCurrencyBRL(csvPat.cobranca)}`)
        totalNoMatch++
        continue
      }

      // Check if invoices exist for this patient + clinic + month/year (may be multiple per professional)
      const existingInvoices = await prisma.invoice.findMany({
        where: {
          clinicId: CLINIC_ID,
          patientId: match.id,
          referenceMonth: MONTH,
          referenceYear: YEAR,
        },
        select: { id: true, totalAmount: true, status: true },
      })
      const existingInvoice = existingInvoices.length > 0 ? {
        id: existingInvoices[0].id,
        totalAmount: existingInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0),
        status: existingInvoices[0].status,
        allInvoices: existingInvoices,
      } : null

      if (existingInvoice) {
        const currentTotal = Number(existingInvoice.totalAmount)
        const diff = csvPat.cobranca - currentTotal
        const targetStatus = csvPat.pago ? "PAGO" : "PENDENTE"
        const statusChanged = existingInvoice.status !== targetStatus

        if (Math.abs(diff) < 0.01 && !statusChanged) {
          console.log(`  OK: ${csvPat.name} → ${formatCurrencyBRL(csvPat.cobranca)} [${existingInvoice.status}] (matches)`)
          totalSkipped++
          continue
        }

        // Add adjustment item if amount differs
        if (Math.abs(diff) >= 0.01) {
          const isPositive = diff > 0
          await prisma.invoiceItem.create({
            data: {
              invoiceId: existingInvoice.id,
              type: isPositive ? "SESSAO_EXTRA" : "CREDITO",
              description: `Ajuste CSV (${isPositive ? "+" : ""}${formatCurrencyBRL(diff)})`,
              quantity: isPositive ? 1 : -1,
              unitPrice: Math.abs(diff),
              total: diff,
            },
          })
          await recalculateInvoiceTotals(existingInvoice.id)
        }

        // Update status if needed
        if (statusChanged) {
          await prisma.invoice.update({
            where: { id: existingInvoice.id },
            data: {
              status: targetStatus,
              ...(targetStatus === "PAGO" ? { paidAt: new Date() } : { paidAt: null }),
            },
          })
        }

        const parts: string[] = []
        if (Math.abs(diff) >= 0.01) parts.push(`diff: ${formatCurrencyBRL(diff)}`)
        if (statusChanged) parts.push(`status: ${existingInvoice.status} → ${targetStatus}`)
        console.log(`  ADJUST: ${csvPat.name} → ${formatCurrencyBRL(csvPat.cobranca)} (${parts.join(", ")})`)
        totalAdjusted++
      } else {
        // Create new invoice
        const patient = dbPatients.find(p => p.id === match.id)!
        const totalSessions = csvPat.totalIndiv + csvPat.totalGrupo + csvPat.totalExtra

        const template = patient.invoiceMessageTemplate
          || clinic?.invoiceMessageTemplate
          || DEFAULT_INVOICE_TEMPLATE

        const messageBody = renderTemplate(template, {
          paciente: patient.name,
          mae: patient.motherName || "",
          pai: patient.fatherName || "",
          valor: formatCurrencyBRL(csvPat.cobranca),
          mes: MONTH_NAMES[MONTH - 1],
          ano: String(YEAR),
          vencimento: DUE_DATE.toLocaleDateString("pt-BR"),
          sessoes: String(totalSessions),
          profissional: profName,
        })

        const invoice = await prisma.invoice.create({
          data: {
            clinicId: CLINIC_ID,
            professionalProfileId: profId,
            patientId: match.id,
            referenceMonth: MONTH,
            referenceYear: YEAR,
            status: csvPat.pago ? "PAGO" : "PENDENTE",
            ...(csvPat.pago ? { paidAt: new Date() } : {}),
            totalSessions,
            creditsApplied: 0,
            extrasAdded: csvPat.totalExtra,
            totalAmount: csvPat.cobranca,
            dueDate: DUE_DATE,
            showAppointmentDays: patient.showAppointmentDaysOnInvoice,
            messageBody,
            items: {
              create: {
                type: "SESSAO_REGULAR",
                description: `${totalSessions} sessões - Fevereiro/2026`,
                quantity: totalSessions,
                unitPrice: totalSessions > 0 ? csvPat.cobranca / totalSessions : csvPat.cobranca,
                total: csvPat.cobranca,
              },
            },
          },
        })

        const statusLabel = csvPat.pago ? "PAGO" : "PENDENTE"
        console.log(`  CREATE: ${csvPat.name} → ${formatCurrencyBRL(csvPat.cobranca)} (${totalSessions} sessões) [${statusLabel}]`)
        totalCreated++
      }
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Created: ${totalCreated}`)
  console.log(`Adjusted: ${totalAdjusted}`)
  console.log(`Skipped: ${totalSkipped}`)
  console.log(`No match: ${totalNoMatch}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
