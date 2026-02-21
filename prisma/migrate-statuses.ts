import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Add new enum values first
  await prisma.$executeRaw`ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADO_ACORDADO'`
  await prisma.$executeRaw`ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADO_FALTA'`

  // Migrate data
  const updated1 = await prisma.$executeRaw`
    UPDATE "Appointment" SET status = 'CANCELADO_ACORDADO' WHERE status = 'CANCELADO_PACIENTE'
  `
  console.log(`Updated ${updated1} CANCELADO_PACIENTE → CANCELADO_ACORDADO`)

  const updated2 = await prisma.$executeRaw`
    UPDATE "Appointment" SET status = 'CANCELADO_FALTA' WHERE status = 'NAO_COMPARECEU'
  `
  console.log(`Updated ${updated2} NAO_COMPARECEU → CANCELADO_FALTA`)

  console.log("Done! Now run: npx prisma db push")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
