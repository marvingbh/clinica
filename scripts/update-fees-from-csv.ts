import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"

const prisma = new PrismaClient()

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

interface PatientCSVData {
  fee: number
  lastReajuste: string
  motherName: string
  fatherName: string
  therapeuticProject: string
  birthDate: string
  schoolName: string
  startDate: string
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

function parseCSV(filePath: string) {
  const raw = readFileSync(filePath, "utf-8")
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""))

  const sectionHeaders = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "GRUPOS", "AVULSOS"]
  const patients = new Map<string, PatientCSVData>()

  for (const line of lines) {
    const row = parseCSVLine(line)
    if (row.length < 30) continue

    const col0 = (row[0] || "").trim()
    const col1 = (row[1] || "").trim()

    if (sectionHeaders.includes(col0) || sectionHeaders.includes(col1)) continue
    if (col0 === "HORA" || col0 === "HORA QUE VEM") continue
    if (!col1 || col1 === "NOME") continue

    const col5 = (row[5] || "").trim()
    if (col5 === "DIAS DO MÊS" || col5 === "Status") continue
    if (col5 === "INDIVIDUAIS") continue

    const feeStr = (row[26] || "").trim()
    const fee = parseFloat(feeStr)
    if (isNaN(fee) || fee === 0) continue

    if (!patients.has(col1)) {
      patients.set(col1, {
        fee,
        lastReajuste: (row[29] || "").trim(),
        motherName: (row[2] || "").trim(),
        fatherName: (row[3] || "").trim(),
        therapeuticProject: (row[4] || "").trim(),
        birthDate: (row[30] || "").trim(),
        schoolName: (row[31] || "").trim(),
        startDate: (row[32] || "").trim(),
      })
    }
  }

  return patients
}

function parseMonthYear(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{2})\/(\d{4})$/)
  if (match) return new Date(`${match[2]}-${match[1]}-01T00:00:00.000Z`)
  return null
}

function parseBirthDate(dateStr: string): Date | null {
  if (!dateStr) return null
  let match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`)
  }
  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (match) {
    const [, day, month, shortYear] = match
    const yr = parseInt(shortYear)
    const fullYear = yr <= 26 ? 2000 + yr : 1900 + yr
    return new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`)
  }
  return null
}

function findMatch(
  csvName: string,
  csvMotherName: string,
  dbPatients: { id: string; name: string }[]
): { id: string; name: string } | undefined {
  const normalizedCsvName = normalize(csvName)

  // 1. Exact match on full name (ignoring parenthetical in DB)
  const exactMatch = dbPatients.find((p) => {
    const dbNameBase = p.name.replace(/\s*\(.*\)\s*$/, "").trim()
    return normalize(dbNameBase) === normalizedCsvName
  })
  if (exactMatch) return exactMatch

  // 2. Fallback: DB name (without parens) is a prefix of CSV name + mother matches
  const normalizedCsvMother = normalize(csvMotherName)
  if (!normalizedCsvMother) return undefined

  const fallbackMatch = dbPatients.find((p) => {
    const parenMatch = p.name.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (parenMatch) {
      // DB has "Name (MotherName)" — check DB base is prefix of CSV name and mother matches
      const dbBase = normalize(parenMatch[1])
      const dbMother = normalize(parenMatch[2])
      return normalizedCsvName.startsWith(dbBase) && dbMother === normalizedCsvMother
    } else {
      // DB has just a name, no parenthetical — check it's a prefix of CSV name
      const dbBase = normalize(p.name)
      return normalizedCsvName.startsWith(dbBase) && dbBase.length > 0
    }
  })
  return fallbackMatch
}

function buildNewName(csvFullName: string, csvMotherName: string, currentDbName: string): string {
  const parenMatch = currentDbName.match(/\((.+)\)\s*$/)
  if (parenMatch) {
    // Keep existing parenthetical
    return `${csvFullName} (${parenMatch[1]})`
  } else {
    // Add mother name in parentheses
    return csvMotherName ? `${csvFullName} (${csvMotherName})` : csvFullName
  }
}

const CLINIC_ID = "cml48q60c0000nxitee84i1l2"

// Map professional name (from filename) to their profile ID
const PROF_MAP: Record<string, string> = {
  elena: "cml48q6d8000anxitnaq3b14q",
  cherlen: "cml48q6e9000cnxit6ycz9ern",
  livia: "cml48q6et000enxit0bkknht6",
}

// Skip these non-patient entries
const SKIP_NAMES = ["ATENDIMENTO CONJUNTO ARTHUR", "CATARINA DA AMANDA"]

function buildPatientFields(data: PatientCSVData) {
  const reajusteDate = parseMonthYear(data.lastReajuste)
  const birthDate = parseBirthDate(data.birthDate)
  const firstAppointmentDate = parseMonthYear(data.startDate)

  const fields: Record<string, unknown> = {
    sessionFee: data.fee,
  }

  if (reajusteDate) fields.lastFeeAdjustmentDate = reajusteDate
  if (data.motherName) fields.motherName = data.motherName
  if (data.fatherName) fields.fatherName = data.fatherName
  if (data.therapeuticProject) fields.therapeuticProject = data.therapeuticProject
  if (birthDate) fields.birthDate = birthDate
  if (data.schoolName) fields.schoolName = data.schoolName
  if (firstAppointmentDate) fields.firstAppointmentDate = firstAppointmentDate

  return fields
}

function detectProfessional(filePath: string): string | null {
  const lower = filePath.toLowerCase()
  for (const [key, profId] of Object.entries(PROF_MAP)) {
    if (lower.includes(key)) return profId
  }
  return null
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error("Usage: npx tsx scripts/update-fees-from-csv.ts <csv-file>")
    process.exit(1)
  }

  const profId = detectProfessional(filePath)
  console.log(`\n=== Processing: ${filePath} ===`)
  if (profId) console.log(`Professional ID: ${profId}`)
  console.log()

  const csvPatients = parseCSV(filePath)
  console.log(`Found ${csvPatients.size} unique patients in CSV:\n`)

  const dbPatients = await prisma.patient.findMany({
    select: { id: true, name: true },
  })

  let updated = 0
  let created = 0
  let skipped = 0

  for (const [csvName, data] of csvPatients) {
    if (SKIP_NAMES.includes(csvName.toUpperCase())) {
      console.log(`  SKIP: ${csvName}`)
      skipped++
      continue
    }

    const match = findMatch(csvName, data.motherName, dbPatients)

    const fields = buildPatientFields(data)

    if (match) {
      // Update existing patient
      const newName = buildNewName(csvName, data.motherName, match.name)
      const nameChanged = newName !== match.name

      const nameLog = nameChanged ? `  [name: "${match.name}" → "${newName}"]` : ""
      console.log(`  UPDATE: ${csvName} → R$${data.fee}${nameLog}`)

      await prisma.patient.update({
        where: { id: match.id },
        data: { ...fields, name: newName },
      })

      match.name = newName
      updated++
    } else {
      // Create new patient
      const fullName = data.motherName ? `${csvName} (${data.motherName})` : csvName

      console.log(`  CREATE: ${fullName} → R$${data.fee}`)

      const newPatient = await prisma.patient.create({
        data: {
          ...fields,
          clinicId: CLINIC_ID,
          name: fullName,
          phone: "00000000000", // placeholder — needs real phone
          ...(profId ? { referenceProfessionalId: profId } : {}),
        },
      })

      // Add to local list so duplicates in same CSV won't create again
      dbPatients.push({ id: newPatient.id, name: fullName })
      created++
    }
  }

  console.log(`\n✓ Updated ${updated}, Created ${created}, Skipped ${skipped}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
