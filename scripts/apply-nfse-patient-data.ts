/**
 * Apply NFS-e billing data from nfse-patient-data.csv to the current database.
 * This CSV was exported from the nfse worktree database after the cadastrodigital import + manual edits.
 *
 * Matches by patient name (exact, case-insensitive, ignoring trailing whitespace).
 * Only updates fields that are currently NULL in the target DB.
 *
 * Usage:
 *   npx tsx scripts/apply-nfse-patient-data.ts          # dry run
 *   npx tsx scripts/apply-nfse-patient-data.ts --apply   # write to DB
 */

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes("--apply")

// Simple CSV parser for well-formed CSV (no multiline fields expected)
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n")
  if (lines.length < 2) return []
  const headers = lines[0].split(",")
  return lines.slice(1).map((line) => {
    const values: string[] = []
    let current = ""
    let inQuotes = false
    for (const ch of line) {
      if (inQuotes) {
        if (ch === '"') inQuotes = false
        else current += ch
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        values.push(current)
        current = ""
      } else {
        current += ch
      }
    }
    values.push(current)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || "").trim() })
    return obj
  })
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN (pass --apply to write)\n" : "✏️  APPLYING CHANGES\n")

  const csvPath = resolve(dirname(fileURLToPath(import.meta.url)), "nfse-patient-data.csv")
  const rows = parseCSV(readFileSync(csvPath, "utf-8"))
  console.log(`CSV: ${rows.length} rows`)

  const patients = await prisma.patient.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, email: true,
      billingCpf: true, billingResponsibleName: true, nfseObs: true,
      addressStreet: true, addressNumber: true, addressNeighborhood: true,
      addressCity: true, addressState: true, addressZip: true,
    },
  })
  console.log(`DB: ${patients.length} active patients\n`)

  const patientMap = new Map(patients.map((p) => [p.name.toLowerCase().trim(), p]))

  let matched = 0
  let updated = 0

  for (const row of rows) {
    const csvName = row.name || ""
    const patient = patientMap.get(csvName.toLowerCase().trim())
    if (!patient) continue

    matched++
    const updates: Record<string, string | null> = {}

    if (row.billingCpf && !patient.billingCpf) updates.billingCpf = row.billingCpf
    if (row.billingResponsibleName && !patient.billingResponsibleName) updates.billingResponsibleName = row.billingResponsibleName
    if (row.email && !patient.email) updates.email = row.email
    if (row.nfseObs && !patient.nfseObs) updates.nfseObs = row.nfseObs
    if (row.addressStreet && !patient.addressStreet) updates.addressStreet = row.addressStreet
    if (row.addressNumber && !patient.addressNumber) updates.addressNumber = row.addressNumber
    if (row.addressNeighborhood && !patient.addressNeighborhood) updates.addressNeighborhood = row.addressNeighborhood
    if (row.addressCity && !patient.addressCity) updates.addressCity = row.addressCity
    if (row.addressState && !patient.addressState) updates.addressState = row.addressState
    if (row.addressZip && !patient.addressZip) updates.addressZip = row.addressZip

    if (Object.keys(updates).length === 0) continue

    updated++
    console.log(`✓ ${patient.name}`)
    for (const [field, value] of Object.entries(updates)) {
      console.log(`    ${field}: ${value}`)
    }

    if (!DRY_RUN) {
      await prisma.patient.update({ where: { id: patient.id }, data: updates })
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Matched: ${matched}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${matched - updated} (already have data)`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
