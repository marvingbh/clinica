import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

async function main() {
  console.log('Seeding database...')

  // Create default clinic
  const clinic = await prisma.clinic.upsert({
    where: { slug: 'clinica-demo' },
    update: {},
    create: {
      name: 'Clinica Demo',
      slug: 'clinica-demo',
      email: 'contato@clinicademo.com',
      phone: '(11) 99999-9999',
      address: 'Rua Exemplo, 123 - Sao Paulo, SP',
      timezone: 'America/Sao_Paulo',
      isActive: true,
      defaultSessionDuration: 50,
      minAdvanceBooking: 2,
      reminderHours: [24, 2],
    },
  })

  console.log(`Created clinic: ${clinic.name}`)

  // Hash password for admin user
  const passwordHash = await bcrypt.hash('admin', SALT_ROUNDS)

  // Create admin user
  const admin = await prisma.user.upsert({
    where: {
      clinicId_email: {
        clinicId: clinic.id,
        email: 'admin',
      },
    },
    update: {
      passwordHash,
    },
    create: {
      clinicId: clinic.id,
      email: 'admin',
      passwordHash,
      name: 'Administrador',
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log(`Created admin user: ${admin.email}`)
  console.log('')
  console.log('='.repeat(50))
  console.log('Default credentials:')
  console.log('  Email: admin')
  console.log('  Password: admin')
  console.log('='.repeat(50))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
