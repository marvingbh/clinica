/**
 * Import NFS-e billing data from cadastrodigital.csv into patient records.
 *
 * Matches CSV rows to patients by name (ignoring parenthetical suffixes in DB names).
 * Updates: billingResponsibleName, billingCpf, email, address fields.
 *
 * Usage:
 *   npx tsx scripts/import-nfse-data.ts          # dry run (default)
 *   npx tsx scripts/import-nfse-data.ts --apply   # actually write to DB
 */

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes("--apply")

// ---------------------------------------------------------------------------
// Simple CSV parser (handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------

function parseCSV(content: string): Record<string, string>[] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field)
        field = ""
      } else if (ch === "\n" || (ch === "\r" && content[i + 1] === "\n")) {
        current.push(field)
        field = ""
        if (current.some((c) => c.trim())) rows.push(current)
        current = []
        if (ch === "\r") i++
      } else {
        field += ch
      }
    }
  }
  // Last row
  current.push(field)
  if (current.some((c) => c.trim())) rows.push(current)

  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (row[i] || "").trim()
    })
    return obj
  })
}

// ---------------------------------------------------------------------------
// Address parser
// ---------------------------------------------------------------------------

function parseAddress(raw: string, cep: string) {
  const clean = raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim()

  // Try to extract number after street name
  // Patterns: "Rua X, 123", "Rua X 123", "Rua X,123"
  const numberMatch = clean.match(/^(.+?)[,\s]+(\d+)\s*(.*)$/)

  let street = clean
  let number = ""
  let complement = ""
  let neighborhood = ""

  if (numberMatch) {
    street = numberMatch[1].trim()
    const rest = numberMatch[2] + " " + (numberMatch[3] || "")

    // Check if number has complement: "70/201", "123 apto 902", "123 AP 1005"
    const compMatch = rest.match(/^(\d+)\s*[/]\s*(\d+)\s*(.*)$/)
    const aptoMatch = rest.match(/^(\d+)\s+(?:apto?\.?|ap\.?)\s*(\d+)\s*(.*)$/i)

    if (compMatch) {
      number = compMatch[1]
      complement = `Apto ${compMatch[2]}`
      const tail = compMatch[3].trim()
      if (tail) neighborhood = cleanNeighborhood(tail)
    } else if (aptoMatch) {
      number = aptoMatch[1]
      complement = `Apto ${aptoMatch[2]}`
      const tail = aptoMatch[3].trim()
      if (tail) neighborhood = cleanNeighborhood(tail)
    } else {
      // Just number + maybe neighborhood
      const parts = rest.trim().split(/\s*[-–]\s*|\s+/)
      number = parts[0] || ""
      const tail = parts.slice(1).join(" ").trim()
      if (tail) neighborhood = cleanNeighborhood(tail)
    }
  }

  // Clean up neighborhood: remove city/state suffixes like "BH/MG", "Belo Horizonte - MG"
  neighborhood = neighborhood
    .replace(/\s*[-–]\s*Belo\s+Horizonte.*$/i, "")
    .replace(/\s*[-–]\s*BH.*$/i, "")
    .replace(/[,.\s]*BH\/?MG\s*$/i, "")
    .replace(/[,.\s]*Belo\s+Horizonte\s*[-–]?\s*MG\s*$/i, "")
    .trim()

  // Normalize CEP: digits only
  const zipClean = cep.replace(/\D/g, "")

  return {
    addressStreet: street || null,
    addressNumber: number || null,
    addressNeighborhood: neighborhood || null,
    addressCity: "Belo Horizonte",
    addressState: "MG",
    addressZip: zipClean.length === 8 ? zipClean : null,
  }
}

function cleanNeighborhood(s: string): string {
  return s.replace(/^[-–.\s]+/, "").replace(/[-–.\s]+$/, "").trim()
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*$/, "") // strip trailing (ParentName)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN (pass --apply to write)\n" : "✏️  APPLYING CHANGES\n")

  // Load CSV
  const csvContent = readFileSync("cadastrodigital.csv", "utf-8")
  const rows = parseCSV(csvContent)
  console.log(`CSV: ${rows.length} rows`)

  // Load active patients
  const patients = await prisma.patient.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, email: true,
      billingCpf: true, billingResponsibleName: true,
      addressStreet: true, addressNumber: true, addressNeighborhood: true,
      addressCity: true, addressState: true, addressZip: true,
    },
  })
  console.log(`DB: ${patients.length} active patients\n`)

  // Build lookup: normalized name -> patient
  const patientMap = new Map<string, typeof patients[number]>()
  for (const p of patients) {
    patientMap.set(normalizeName(p.name), p)
  }

  let matched = 0
  let updated = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const row of rows) {
    const csvName = (row["Nome completo da criança/adolescente:"] || "").trim()
    if (!csvName) continue

    const key = normalizeName(csvName)
    const patient = patientMap.get(key)

    if (!patient) {
      unmatched.push(csvName)
      continue
    }

    matched++

    const responsavel = (row["Nome do responsável financeiro:"] || "").trim()
    const cpf = (row["CPF/CNPJ:"] || "").replace(/\D/g, "")
    const email = (row["E-mail:"] || "").trim().toLowerCase()
    const endereco = (row["Endereço:"] || "").trim()
    const cep = (row["CEP:"] || "").trim()

    const addr = endereco ? parseAddress(endereco, cep) : null

    // Build update — only set fields that are currently empty
    const updates: Record<string, string | null> = {}

    if (responsavel && !patient.billingResponsibleName) {
      updates.billingResponsibleName = responsavel
    }
    if (cpf && !patient.billingCpf) {
      updates.billingCpf = cpf
    }
    if (email && !patient.email) {
      updates.email = email
    }
    if (addr) {
      if (addr.addressStreet && !patient.addressStreet) updates.addressStreet = addr.addressStreet
      if (addr.addressNumber && !patient.addressNumber) updates.addressNumber = addr.addressNumber
      if (addr.addressNeighborhood && !patient.addressNeighborhood) updates.addressNeighborhood = addr.addressNeighborhood
      if (addr.addressCity && !patient.addressCity) updates.addressCity = addr.addressCity
      if (addr.addressState && !patient.addressState) updates.addressState = addr.addressState
      if (addr.addressZip && !patient.addressZip) updates.addressZip = addr.addressZip
    }

    if (Object.keys(updates).length === 0) {
      skipped++
      continue
    }

    updated++
    console.log(`✓ ${patient.name}`)
    for (const [field, value] of Object.entries(updates)) {
      console.log(`    ${field}: ${value}`)
    }

    if (!DRY_RUN) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: updates,
      })
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Matched:   ${matched}`)
  console.log(`Updated:   ${updated}`)
  console.log(`Skipped:   ${skipped} (already have data)`)
  console.log(`Unmatched: ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log(`\nUnmatched CSV names:`)
    for (const name of unmatched.slice(0, 20)) {
      console.log(`  - ${name}`)
    }
    if (unmatched.length > 20) console.log(`  ... and ${unmatched.length - 20} more`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
