import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

// Helper to get next Monday
function getNextMonday(): Date {
  const today = new Date()
  const currentDay = today.getDay()
  const daysUntilMonday = currentDay === 0 ? 1 : 8 - currentDay
  const result = new Date(today)
  result.setDate(result.getDate() + daysUntilMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

// Helper to add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// Helper to set time on a date
function setTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}

// Helper to add minutes to a date
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

// Patient data extracted from horarios.pdf
interface PatientInput {
  childName: string
  motherName: string
  displayName: string
}

function parsePatientName(raw: string): PatientInput {
  const parts = raw.split('/').map(s => s.trim())
  const childName = parts[0]
  const motherName = parts[1] || ''
  return { childName, motherName, displayName: childName }
}

async function main() {
  console.log('Cleaning database...')

  // Clean database in correct order (respecting foreign keys)
  await prisma.notification.deleteMany({})
  await prisma.appointmentToken.deleteMany({})
  await prisma.appointment.deleteMany({})
  await prisma.appointmentRecurrence.deleteMany({})
  await prisma.groupMembership.deleteMany({})
  await prisma.therapyGroup.deleteMany({})
  await prisma.availabilityException.deleteMany({})
  await prisma.availabilityRule.deleteMany({})
  await prisma.patient.deleteMany({})
  await prisma.auditLog.deleteMany({})
  await prisma.notificationTemplate.deleteMany({})
  await prisma.professionalProfile.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.clinic.deleteMany({})

  console.log('Database cleaned.')
  console.log('')
  console.log('Seeding database with horarios.pdf data...')
  console.log('')

  // ============================================================================
  // 1. CREATE CLINIC
  // ============================================================================
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Clinica Terapeutica',
      slug: 'clinica-terapeutica',
      email: 'contato@clinicaterapeutica.com',
      phone: '(11) 99999-9999',
      address: 'Rua Exemplo, 123 - Sao Paulo, SP',
      timezone: 'America/Sao_Paulo',
      isActive: true,
      defaultSessionDuration: 45,
      minAdvanceBooking: 2,
      reminderHours: [24, 2],
    },
  })

  console.log(`[Clinic] Created: ${clinic.name}`)

  // ============================================================================
  // 2. CREATE USERS (1 ADMIN + 3 PROFESSIONALS)
  // ============================================================================
  const passwordHash = await bcrypt.hash('admin', SALT_ROUNDS)
  const professionalPasswordHash = await bcrypt.hash('senha123', SALT_ROUNDS)

  const admin = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: 'admin@x.com',
      passwordHash,
      name: 'Administrador',
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log(`[User] Created admin: ${admin.email}`)

  const userElena = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: 'elena.sabino@clinicaterapeutica.com',
      passwordHash: professionalPasswordHash,
      name: 'Elena Sabino',
      role: 'PROFESSIONAL',
      isActive: true,
    },
  })

  const userCherlen = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: 'cherlen.aidano@clinicaterapeutica.com',
      passwordHash: professionalPasswordHash,
      name: 'Cherlen Aidano',
      role: 'PROFESSIONAL',
      isActive: true,
    },
  })

  const userLivia = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      email: 'livia.moreira@clinicaterapeutica.com',
      passwordHash: professionalPasswordHash,
      name: 'Livia Moreira',
      role: 'PROFESSIONAL',
      isActive: true,
    },
  })

  console.log(`[Users] Created professionals: Elena Sabino, Cherlen Aidano, Livia Moreira`)

  // ============================================================================
  // 3. CREATE PROFESSIONAL PROFILES
  // ============================================================================
  const profileElena = await prisma.professionalProfile.create({
    data: {
      userId: userElena.id,
      specialty: 'Terapia Ocupacional',
      registrationNumber: 'CREFITO 00001',
      bio: 'Terapeuta ocupacional com foco em atendimento infantil.',
      appointmentDuration: 45,
      bufferBetweenSlots: 0,
      allowOnlineBooking: true,
      maxAdvanceBookingDays: 60,
    },
  })

  const profileCherlen = await prisma.professionalProfile.create({
    data: {
      userId: userCherlen.id,
      specialty: 'Terapia Ocupacional',
      registrationNumber: 'CREFITO 00002',
      bio: 'Terapeuta ocupacional especializada em desenvolvimento infantil.',
      appointmentDuration: 45,
      bufferBetweenSlots: 0,
      allowOnlineBooking: true,
      maxAdvanceBookingDays: 60,
    },
  })

  const profileLivia = await prisma.professionalProfile.create({
    data: {
      userId: userLivia.id,
      specialty: 'Terapia Ocupacional',
      registrationNumber: 'CREFITO 00003',
      bio: 'Terapeuta ocupacional com experiencia em integracao sensorial.',
      appointmentDuration: 45,
      bufferBetweenSlots: 0,
      allowOnlineBooking: true,
      maxAdvanceBookingDays: 60,
    },
  })

  console.log(`[Profiles] Created 3 professional profiles`)

  // ============================================================================
  // 4. CREATE AVAILABILITY RULES
  // ============================================================================
  const elenaAvailability = [
    { dayOfWeek: 1, startTime: '07:15', endTime: '19:30' },
    { dayOfWeek: 2, startTime: '09:30', endTime: '19:30' },
    { dayOfWeek: 4, startTime: '13:00', endTime: '18:00' },
    { dayOfWeek: 5, startTime: '08:00', endTime: '17:00' },
  ]

  for (const rule of elenaAvailability) {
    await prisma.availabilityRule.create({
      data: { professionalProfileId: profileElena.id, ...rule, isActive: true },
    })
  }

  const cherlenAvailability = [
    { dayOfWeek: 2, startTime: '08:45', endTime: '18:00' },
    { dayOfWeek: 4, startTime: '08:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '08:00', endTime: '11:00' },
  ]

  for (const rule of cherlenAvailability) {
    await prisma.availabilityRule.create({
      data: { professionalProfileId: profileCherlen.id, ...rule, isActive: true },
    })
  }

  const liviaAvailability = [
    { dayOfWeek: 2, startTime: '09:30', endTime: '19:00' },
    { dayOfWeek: 3, startTime: '17:30', endTime: '19:30' },
    { dayOfWeek: 4, startTime: '17:30', endTime: '18:15' },
    { dayOfWeek: 5, startTime: '08:00', endTime: '09:30' },
  ]

  for (const rule of liviaAvailability) {
    await prisma.availabilityRule.create({
      data: { professionalProfileId: profileLivia.id, ...rule, isActive: true },
    })
  }

  console.log(`[Availability] Created availability rules for all professionals`)

  // ============================================================================
  // 5. CREATE PATIENTS
  // ============================================================================
  const patientRawData = [
    'Dora / Juliana', 'Maria Eduarda / Janete', 'Sofia / Lorena', 'Daniel / Cristiane',
    'Luiza / Fabiana', 'Gabriel / Érica', 'Catarina / Paula', 'Alice / Juliana',
    'Valentina / Fernanda', 'Laura / Paulla', 'Luísa / Fernanda', 'Felipe / Flávia',
    'Miguel / Carolina', 'Ana Vitória / Priscila', 'Alice / Priscila', 'Sophia / Grazielle',
    'Helena / Fernanda', 'Leonardo / Fabiana', 'Ana Clara / Cleyonara', 'Bernardo / Daniela',
    'Matheus / Daniela', 'Bruna / Simone', 'Byannca / Viviane', 'Arthur / Olívia',
    'Pedro / Cibele', 'Rafael / Mariana', 'Maria Luísa / Amanda', 'Júlia / Fernanda',
    'Bernardo / Andressa', 'Beatriz / Priscilla', 'Eduardo / Áquila', 'Beatriz / Ana Luiza',
    'Gabriel / Cristiane', 'Felipe / Virgínia', 'Ana Cecília / Érica', 'Laura / Graziella',
    'Marcela / Júlia', 'Pedro / Daniela', 'Vicente / Bruna', 'André / Amanda',
    'Clarice / Juliana', 'Luisa / Estér', 'Bernardo / Jacqueline', 'Gabriel / Nathália',
    'Antônio / Ana Flávia', 'Manuela / Débora', 'Rafael / Ana Paula', 'Mariana / Renata',
    'Iara / Érica', 'Luisa / Flávia', 'Luisa / Ana Paula', 'Pedro / Karine',
    'Teodoro / Juliana', 'Helena / Silviana', 'Alice / Erica', 'Laura / Amanda',
    'Cecília / Simone', 'Maria Eduarda / Mirela', 'Luiza / Sibely', 'Mariane / Danielle',
    'João Lucas / Adriana', 'Luísa / Fabíola', 'Marina / Cristiane', 'Guilherme / Déborah',
    'Rafaela / Ana Paula', 'Enrico / Mariana', 'Diogo / Gláucia', 'Carolina / Patrícia',
    'Samir / Ana Carolina', 'Henrique / Laura', 'Lucas / Fábia', 'Luiza / Mônica',
    'Manuela / Marília', 'Sarah / Juliana', 'Bernardo / Rutth', 'Arthur / Marília',
    'Laís / Luísa', 'Hugo / Cristal',
  ]

  const patientMap = new Map<string, PatientInput>()
  const nameCount = new Map<string, number>()

  for (const raw of patientRawData) {
    const parsed = parsePatientName(raw)
    const count = nameCount.get(parsed.childName) || 0
    nameCount.set(parsed.childName, count + 1)
  }

  for (const raw of patientRawData) {
    const parsed = parsePatientName(raw)
    const count = nameCount.get(parsed.childName) || 0
    const uniqueKey = `${parsed.childName}|${parsed.motherName}`

    if (!patientMap.has(uniqueKey)) {
      if (count > 1) {
        parsed.displayName = `${parsed.childName} (${parsed.motherName})`
      }
      patientMap.set(uniqueKey, parsed)
    }
  }

  const patients = new Map<string, string>()
  let phoneCounter = 1

  for (const [uniqueKey, data] of patientMap) {
    const phone = `(11) 9${String(phoneCounter).padStart(4, '0')}-${String(phoneCounter).padStart(4, '0')}`
    phoneCounter++

    const patient = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        name: data.displayName,
        motherName: data.motherName,
        phone,
        consentWhatsApp: true,
        consentWhatsAppAt: new Date(),
        consentEmail: false,
        isActive: true,
      },
    })

    patients.set(uniqueKey, patient.id)
  }

  console.log(`[Patients] Created ${patients.size} patients`)

  // ============================================================================
  // 6. HELPER TO GET PATIENT ID
  // ============================================================================
  function getPatientId(raw: string): string {
    const parsed = parsePatientName(raw)
    const uniqueKey = `${parsed.childName}|${parsed.motherName}`
    const id = patients.get(uniqueKey)
    if (!id) throw new Error(`Patient not found: ${raw}`)
    return id
  }

  // ============================================================================
  // 7. APPOINTMENT DATA - grouped by professional/day/time
  // ============================================================================
  interface AppointmentSlot {
    professionalProfileId: string
    dayOfWeek: number
    time: string
    patients: string[] // Raw patient strings
  }

  // All appointment slots from the PDF
  const slots: AppointmentSlot[] = [
    // ELENA - SEGUNDA (1)
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '07:15', patients: ['Dora / Juliana'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '08:00', patients: ['Dora / Juliana', 'Maria Eduarda / Janete'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '08:45', patients: ['Sofia / Lorena', 'Daniel / Cristiane'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '09:30', patients: ['Luiza / Fabiana', 'Gabriel / Érica'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '10:15', patients: ['Catarina / Paula'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '13:00', patients: ['Alice / Juliana'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '13:15', patients: ['Valentina / Fernanda'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 1, time: '14:30', patients: ['Laura / Paulla'] },

    // ELENA - TERCA (2)
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '09:30', patients: ['Luísa / Fernanda', 'Felipe / Flávia'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '10:15', patients: ['Miguel / Carolina'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '13:00', patients: ['Alice / Juliana', 'Ana Vitória / Priscila'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '13:45', patients: ['Alice / Priscila'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '14:30', patients: ['Ana Vitória / Priscila', 'Laura / Paulla'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '15:15', patients: ['Sophia / Grazielle'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '16:00', patients: ['Helena / Fernanda', 'Leonardo / Fabiana'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '16:45', patients: ['Ana Clara / Cleyonara'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '17:30', patients: ['Bernardo / Daniela'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '18:15', patients: ['Matheus / Daniela'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 2, time: '19:00', patients: ['Bruna / Simone'] },

    // ELENA - QUINTA (4)
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '13:00', patients: ['Byannca / Viviane', 'Arthur / Olívia'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '13:45', patients: ['Pedro / Cibele'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '14:30', patients: ['Rafael / Mariana'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '15:15', patients: ['Maria Luísa / Amanda'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '16:15', patients: ['Júlia / Fernanda'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 4, time: '17:00', patients: ['Bernardo / Andressa', 'Beatriz / Priscilla'] },

    // ELENA - SEXTA (5)
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '08:45', patients: ['Eduardo / Áquila', 'Beatriz / Ana Luiza'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '09:30', patients: ['Gabriel / Cristiane', 'Felipe / Virgínia'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '10:15', patients: ['Ana Cecília / Érica'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '11:00', patients: ['Felipe / Virgínia', 'Eduardo / Áquila'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '13:15', patients: ['Laura / Graziella'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '14:00', patients: ['Marcela / Júlia', 'Pedro / Daniela'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '14:45', patients: ['Pedro / Daniela', 'Vicente / Bruna'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '15:30', patients: ['André / Amanda'] },
    { professionalProfileId: profileElena.id, dayOfWeek: 5, time: '16:15', patients: ['Clarice / Juliana', 'Luisa / Estér'] },

    // CHERLEN - TERCA (2)
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '08:45', patients: ['Bernardo / Jacqueline'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '09:30', patients: ['Gabriel / Nathália'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '10:15', patients: ['Antônio / Ana Flávia'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '14:30', patients: ['Manuela / Débora', 'Rafael / Ana Paula'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '15:15', patients: ['Mariana / Renata', 'Iara / Érica'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '16:00', patients: ['Luisa / Flávia'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '16:45', patients: ['Luisa / Ana Paula'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 2, time: '17:30', patients: ['Pedro / Karine'] },

    // CHERLEN - QUINTA (4)
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '08:00', patients: ['Teodoro / Juliana'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '10:15', patients: ['Helena / Silviana'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '11:00', patients: ['Alice / Erica'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '13:00', patients: ['Laura / Amanda'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '13:45', patients: ['Cecília / Simone'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '14:30', patients: ['Maria Eduarda / Mirela'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '15:15', patients: ['Luiza / Sibely', 'Mariane / Danielle'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '16:00', patients: ['João Lucas / Adriana'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 4, time: '16:45', patients: ['Luísa / Fabíola'] },

    // CHERLEN - SEXTA (5)
    { professionalProfileId: profileCherlen.id, dayOfWeek: 5, time: '08:00', patients: ['Marina / Cristiane'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 5, time: '08:45', patients: ['Guilherme / Déborah'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 5, time: '09:30', patients: ['Rafaela / Ana Paula'] },
    { professionalProfileId: profileCherlen.id, dayOfWeek: 5, time: '10:15', patients: ['Enrico / Mariana'] },

    // LIVIA - TERCA (2)
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '09:30', patients: ['Diogo / Gláucia'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '14:30', patients: ['Carolina / Patrícia'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '16:00', patients: ['Samir / Ana Carolina'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '16:45', patients: ['Henrique / Laura'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '17:45', patients: ['Lucas / Fábia'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 2, time: '18:30', patients: ['Luiza / Mônica'] },

    // LIVIA - QUARTA (3)
    { professionalProfileId: profileLivia.id, dayOfWeek: 3, time: '17:30', patients: ['Manuela / Marília'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 3, time: '18:15', patients: ['Sarah / Juliana'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 3, time: '19:00', patients: ['Bernardo / Rutth'] },

    // LIVIA - QUINTA (4)
    { professionalProfileId: profileLivia.id, dayOfWeek: 4, time: '17:30', patients: ['Arthur / Marília'] },

    // LIVIA - SEXTA (5)
    { professionalProfileId: profileLivia.id, dayOfWeek: 5, time: '08:00', patients: ['Laís / Luísa'] },
    { professionalProfileId: profileLivia.id, dayOfWeek: 5, time: '08:45', patients: ['Hugo / Cristal'] },
  ]

  // ============================================================================
  // 8. CREATE RECURRENCES AND APPOINTMENTS
  // ============================================================================
  const nextMonday = getNextMonday()
  const sessionDuration = 45
  const weeksToGenerate = 8 // Generate 8 weeks of appointments

  let recurrenceCount = 0
  let appointmentCount = 0

  for (const slot of slots) {
    const [hours, minutes] = slot.time.split(':').map(Number)
    const isBiweekly = slot.patients.length === 2

    for (let patientIndex = 0; patientIndex < slot.patients.length; patientIndex++) {
      const patientRaw = slot.patients[patientIndex]
      const patientId = getPatientId(patientRaw)

      // Calculate start date based on day of week
      // dayOfWeek: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
      const daysFromMonday = slot.dayOfWeek - 1
      let startDate = addDays(nextMonday, daysFromMonday)

      // For biweekly, second patient starts one week later
      if (isBiweekly && patientIndex === 1) {
        startDate = addDays(startDate, 7)
      }

      // Create recurrence
      const recurrence = await prisma.appointmentRecurrence.create({
        data: {
          clinicId: clinic.id,
          professionalProfileId: slot.professionalProfileId,
          patientId,
          modality: 'PRESENCIAL',
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.time,
          endTime: `${String(hours).padStart(2, '0')}:${String(minutes + sessionDuration).padStart(2, '0')}`,
          duration: sessionDuration,
          recurrenceType: isBiweekly ? 'BIWEEKLY' : 'WEEKLY',
          recurrenceEndType: 'INDEFINITE',
          startDate,
          isActive: true,
        },
      })
      recurrenceCount++

      // Generate appointments for the next weeks
      const interval = isBiweekly ? 14 : 7 // days between appointments
      for (let week = 0; week < weeksToGenerate; week++) {
        const appointmentDate = addDays(startDate, week * interval)
        const scheduledAt = setTime(appointmentDate, hours, minutes)
        const endAt = addMinutes(scheduledAt, sessionDuration)

        await prisma.appointment.create({
          data: {
            clinicId: clinic.id,
            professionalProfileId: slot.professionalProfileId,
            patientId,
            recurrenceId: recurrence.id,
            scheduledAt,
            endAt,
            status: 'AGENDADO',
            modality: 'PRESENCIAL',
          },
        })
        appointmentCount++
      }
    }
  }

  console.log(`[Recurrences] Created ${recurrenceCount} recurrence patterns`)
  console.log(`[Appointments] Created ${appointmentCount} appointments (${weeksToGenerate} weeks)`)

  // Count weekly vs biweekly
  const weeklySlots = slots.filter(s => s.patients.length === 1).length
  const biweeklySlots = slots.filter(s => s.patients.length === 2).length

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('')
  console.log('='.repeat(60))
  console.log('SEED COMPLETED SUCCESSFULLY')
  console.log('='.repeat(60))
  console.log('')
  console.log('Created:')
  console.log(`  - 1 Clinic: ${clinic.name}`)
  console.log(`  - 1 Admin user: admin@x.com / admin`)
  console.log(`  - 3 Professional users:`)
  console.log(`      * elena.sabino@clinicaterapeutica.com / senha123`)
  console.log(`      * cherlen.aidano@clinicaterapeutica.com / senha123`)
  console.log(`      * livia.moreira@clinicaterapeutica.com / senha123`)
  console.log(`  - ${patients.size} Patients`)
  console.log(`  - ${recurrenceCount} Recurrence patterns:`)
  console.log(`      * ${weeklySlots} weekly (1 patient per slot)`)
  console.log(`      * ${biweeklySlots * 2} biweekly (2 patients alternating per slot)`)
  console.log(`  - ${appointmentCount} Appointments (${weeksToGenerate} weeks from ${nextMonday.toLocaleDateString('pt-BR')})`)
  console.log('')
  console.log('='.repeat(60))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
