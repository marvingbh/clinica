import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

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

// Helper to get next occurrence of a weekday
function getNextWeekday(dayOfWeek: number, weeksAhead: number = 0): Date {
  const today = new Date()
  const currentDay = today.getDay()
  let daysUntil = dayOfWeek - currentDay
  if (daysUntil <= 0) daysUntil += 7
  const result = addDays(today, daysUntil + weeksAhead * 7)
  return result
}

async function main() {
  console.log('Seeding database...')
  console.log('')

  // ============================================================================
  // 1. CREATE CLINIC
  // ============================================================================
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

  console.log(`[Clinic] Created: ${clinic.name}`)

  // ============================================================================
  // 2. CREATE USERS (1 ADMIN + 2 PROFESSIONALS)
  // ============================================================================
  const passwordHash = await bcrypt.hash('admin', SALT_ROUNDS)
  const professionalPasswordHash = await bcrypt.hash('senha123', SALT_ROUNDS)

  // Admin user
  const admin = await prisma.user.upsert({
    where: {
      clinicId_email: {
        clinicId: clinic.id,
        email: 'admin@x.com',
      },
    },
    update: { passwordHash },
    create: {
      clinicId: clinic.id,
      email: 'admin@x.com',
      passwordHash,
      name: 'Administrador',
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log(`[User] Created admin: ${admin.email}`)

  // Professional 1 - Psychologist
  const professional1 = await prisma.user.upsert({
    where: {
      clinicId_email: {
        clinicId: clinic.id,
        email: 'dr.maria@clinicademo.com',
      },
    },
    update: { passwordHash: professionalPasswordHash },
    create: {
      clinicId: clinic.id,
      email: 'dr.maria@clinicademo.com',
      passwordHash: professionalPasswordHash,
      name: 'Dra. Maria Silva',
      role: 'PROFESSIONAL',
      isActive: true,
    },
  })

  console.log(`[User] Created professional: ${professional1.email}`)

  // Professional 2 - Therapist
  const professional2 = await prisma.user.upsert({
    where: {
      clinicId_email: {
        clinicId: clinic.id,
        email: 'dr.joao@clinicademo.com',
      },
    },
    update: { passwordHash: professionalPasswordHash },
    create: {
      clinicId: clinic.id,
      email: 'dr.joao@clinicademo.com',
      passwordHash: professionalPasswordHash,
      name: 'Dr. Joao Santos',
      role: 'PROFESSIONAL',
      isActive: true,
    },
  })

  console.log(`[User] Created professional: ${professional2.email}`)

  // ============================================================================
  // 3. CREATE PROFESSIONAL PROFILES
  // ============================================================================
  const profile1 = await prisma.professionalProfile.upsert({
    where: { userId: professional1.id },
    update: {},
    create: {
      userId: professional1.id,
      specialty: 'Psicologia Clinica',
      registrationNumber: 'CRP 06/123456',
      bio: 'Especialista em terapia cognitivo-comportamental com 10 anos de experiencia.',
      appointmentDuration: 50,
      bufferBetweenSlots: 10,
      allowOnlineBooking: true,
      maxAdvanceBookingDays: 30,
    },
  })

  console.log(`[Profile] Created: ${professional1.name}`)

  const profile2 = await prisma.professionalProfile.upsert({
    where: { userId: professional2.id },
    update: {},
    create: {
      userId: professional2.id,
      specialty: 'Psicanalise',
      registrationNumber: 'CRP 06/654321',
      bio: 'Psicanalista com abordagem lacaniana, atendendo adultos e adolescentes.',
      appointmentDuration: 50,
      bufferBetweenSlots: 10,
      allowOnlineBooking: true,
      maxAdvanceBookingDays: 60,
    },
  })

  console.log(`[Profile] Created: ${professional2.name}`)

  // ============================================================================
  // 4. CREATE AVAILABILITY RULES
  // ============================================================================

  // Professional 1: Monday to Friday, 8:00-12:00 and 14:00-18:00
  const availabilitySchedule1 = [
    { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }, // Monday morning
    { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' }, // Monday afternoon
    { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' }, // Tuesday morning
    { dayOfWeek: 2, startTime: '14:00', endTime: '18:00' }, // Tuesday afternoon
    { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' }, // Wednesday morning
    { dayOfWeek: 3, startTime: '14:00', endTime: '18:00' }, // Wednesday afternoon
    { dayOfWeek: 4, startTime: '08:00', endTime: '12:00' }, // Thursday morning
    { dayOfWeek: 4, startTime: '14:00', endTime: '18:00' }, // Thursday afternoon
    { dayOfWeek: 5, startTime: '09:00', endTime: '13:00' }, // Friday (shorter day)
  ]

  // Delete existing rules and recreate
  await prisma.availabilityRule.deleteMany({
    where: { professionalProfileId: profile1.id },
  })

  for (const schedule of availabilitySchedule1) {
    await prisma.availabilityRule.create({
      data: {
        professionalProfileId: profile1.id,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isActive: true,
      },
    })
  }

  console.log(`[Availability] Created ${availabilitySchedule1.length} rules for ${professional1.name}`)

  // Professional 2: Tuesday to Saturday
  const availabilitySchedule2 = [
    { dayOfWeek: 2, startTime: '10:00', endTime: '14:00' }, // Tuesday
    { dayOfWeek: 2, startTime: '16:00', endTime: '20:00' }, // Tuesday evening
    { dayOfWeek: 3, startTime: '10:00', endTime: '14:00' }, // Wednesday
    { dayOfWeek: 3, startTime: '16:00', endTime: '20:00' }, // Wednesday evening
    { dayOfWeek: 4, startTime: '10:00', endTime: '14:00' }, // Thursday
    { dayOfWeek: 4, startTime: '16:00', endTime: '20:00' }, // Thursday evening
    { dayOfWeek: 5, startTime: '10:00', endTime: '14:00' }, // Friday
    { dayOfWeek: 6, startTime: '09:00', endTime: '13:00' }, // Saturday morning
  ]

  await prisma.availabilityRule.deleteMany({
    where: { professionalProfileId: profile2.id },
  })

  for (const schedule of availabilitySchedule2) {
    await prisma.availabilityRule.create({
      data: {
        professionalProfileId: profile2.id,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isActive: true,
      },
    })
  }

  console.log(`[Availability] Created ${availabilitySchedule2.length} rules for ${professional2.name}`)

  // ============================================================================
  // 5. CREATE PATIENTS (10 with varied consent settings)
  // ============================================================================
  const patientData = [
    {
      name: 'Ana Paula Costa',
      email: 'ana.costa@email.com',
      phone: '(11) 98765-0001',
      cpf: '123.456.789-01',
      birthDate: new Date('1990-03-15'),
      consentWhatsApp: true,
      consentEmail: true,
      notes: 'Paciente desde 2023. Preferencia por horarios matutinos.',
    },
    {
      name: 'Bruno Ferreira Lima',
      email: 'bruno.lima@email.com',
      phone: '(11) 98765-0002',
      cpf: '123.456.789-02',
      birthDate: new Date('1985-07-22'),
      consentWhatsApp: true,
      consentEmail: false,
      notes: 'Atendimento presencial apenas.',
    },
    {
      name: 'Carla Mendes Souza',
      email: 'carla.souza@email.com',
      phone: '(11) 98765-0003',
      cpf: '123.456.789-03',
      birthDate: new Date('1992-11-08'),
      consentWhatsApp: false,
      consentEmail: true,
      notes: null,
    },
    {
      name: 'Daniel Oliveira Santos',
      email: 'daniel.santos@email.com',
      phone: '(11) 98765-0004',
      cpf: '123.456.789-04',
      birthDate: new Date('1978-01-30'),
      consentWhatsApp: true,
      consentEmail: true,
      notes: 'Prefere sessoes online.',
    },
    {
      name: 'Elena Rodrigues',
      email: null,
      phone: '(11) 98765-0005',
      cpf: '123.456.789-05',
      birthDate: new Date('1995-06-12'),
      consentWhatsApp: true,
      consentEmail: false,
      notes: 'Sem email cadastrado.',
    },
    {
      name: 'Fernando Almeida',
      email: 'fernando.almeida@email.com',
      phone: '(11) 98765-0006',
      cpf: '123.456.789-06',
      birthDate: new Date('1988-09-25'),
      consentWhatsApp: false,
      consentEmail: false,
      notes: 'Nao deseja receber lembretes automaticos.',
    },
    {
      name: 'Gabriela Nascimento',
      email: 'gabi.nascimento@email.com',
      phone: '(11) 98765-0007',
      cpf: '123.456.789-07',
      birthDate: new Date('2000-04-18'),
      consentWhatsApp: true,
      consentEmail: true,
      notes: 'Estudante universitaria. Horarios flexiveis.',
    },
    {
      name: 'Henrique Barbosa',
      email: 'henrique.barbosa@email.com',
      phone: '(11) 98765-0008',
      cpf: '123.456.789-08',
      birthDate: new Date('1975-12-03'),
      consentWhatsApp: true,
      consentEmail: false,
      notes: null,
    },
    {
      name: 'Isabela Martins',
      email: 'isabela.martins@email.com',
      phone: '(11) 98765-0009',
      cpf: '123.456.789-09',
      birthDate: new Date('1998-08-20'),
      consentWhatsApp: false,
      consentEmail: true,
      notes: 'Primeira consulta agendada.',
    },
    {
      name: 'Joao Pedro Cardoso',
      email: 'jp.cardoso@email.com',
      phone: '(11) 98765-0010',
      cpf: '123.456.789-10',
      birthDate: new Date('1982-02-14'),
      consentWhatsApp: true,
      consentEmail: true,
      notes: 'Paciente recorrente ha 2 anos.',
    },
  ]

  const patients: Array<{ id: string; name: string; phone: string; email: string | null; consentWhatsApp: boolean; consentEmail: boolean }> = []

  for (const data of patientData) {
    const patient = await prisma.patient.upsert({
      where: {
        clinicId_phone: {
          clinicId: clinic.id,
          phone: data.phone,
        },
      },
      update: {},
      create: {
        clinicId: clinic.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        cpf: data.cpf,
        birthDate: data.birthDate,
        consentWhatsApp: data.consentWhatsApp,
        consentWhatsAppAt: data.consentWhatsApp ? new Date() : null,
        consentEmail: data.consentEmail,
        consentEmailAt: data.consentEmail ? new Date() : null,
        notes: data.notes,
        isActive: true,
      },
    })
    patients.push({
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      consentWhatsApp: patient.consentWhatsApp,
      consentEmail: patient.consentEmail,
    })
  }

  console.log(`[Patients] Created ${patients.length} patients`)

  // ============================================================================
  // 6. CREATE APPOINTMENTS (across next 2 weeks)
  // ============================================================================

  // Delete existing appointments for seed patients to avoid duplicates
  await prisma.appointment.deleteMany({
    where: {
      clinicId: clinic.id,
      patientId: { in: patients.map((p) => p.id) },
    },
  })

  const appointments: Array<{
    professionalProfileId: string
    patientId: string
    scheduledAt: Date
    endAt: Date
    status: 'AGENDADO' | 'CONFIRMADO' | 'FINALIZADO'
    modality: 'ONLINE' | 'PRESENCIAL'
  }> = []

  // Week 1 appointments
  // Monday
  const monday1 = getNextWeekday(1, 0)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[0].id, scheduledAt: setTime(monday1, 9, 0), endAt: setTime(monday1, 9, 50), status: 'CONFIRMADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile1.id, patientId: patients[1].id, scheduledAt: setTime(monday1, 10, 0), endAt: setTime(monday1, 10, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile1.id, patientId: patients[2].id, scheduledAt: setTime(monday1, 14, 0), endAt: setTime(monday1, 14, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Tuesday
  const tuesday1 = getNextWeekday(2, 0)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[3].id, scheduledAt: setTime(tuesday1, 8, 0), endAt: setTime(tuesday1, 8, 50), status: 'CONFIRMADO', modality: 'ONLINE' },
    { professionalProfileId: profile2.id, patientId: patients[4].id, scheduledAt: setTime(tuesday1, 10, 0), endAt: setTime(tuesday1, 10, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[5].id, scheduledAt: setTime(tuesday1, 16, 0), endAt: setTime(tuesday1, 16, 50), status: 'CONFIRMADO', modality: 'PRESENCIAL' },
  )

  // Wednesday
  const wednesday1 = getNextWeekday(3, 0)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[6].id, scheduledAt: setTime(wednesday1, 9, 0), endAt: setTime(wednesday1, 9, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[7].id, scheduledAt: setTime(wednesday1, 11, 0), endAt: setTime(wednesday1, 11, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Thursday
  const thursday1 = getNextWeekday(4, 0)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[8].id, scheduledAt: setTime(thursday1, 10, 0), endAt: setTime(thursday1, 10, 50), status: 'CONFIRMADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[9].id, scheduledAt: setTime(thursday1, 17, 0), endAt: setTime(thursday1, 17, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
  )

  // Friday
  const friday1 = getNextWeekday(5, 0)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[0].id, scheduledAt: setTime(friday1, 9, 0), endAt: setTime(friday1, 9, 50), status: 'AGENDADO', modality: 'ONLINE' },
    { professionalProfileId: profile2.id, patientId: patients[1].id, scheduledAt: setTime(friday1, 11, 0), endAt: setTime(friday1, 11, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
  )

  // Saturday
  const saturday1 = getNextWeekday(6, 0)
  appointments.push(
    { professionalProfileId: profile2.id, patientId: patients[2].id, scheduledAt: setTime(saturday1, 9, 0), endAt: setTime(saturday1, 9, 50), status: 'CONFIRMADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[3].id, scheduledAt: setTime(saturday1, 10, 0), endAt: setTime(saturday1, 10, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Week 2 appointments
  // Monday
  const monday2 = getNextWeekday(1, 1)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[4].id, scheduledAt: setTime(monday2, 8, 0), endAt: setTime(monday2, 8, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile1.id, patientId: patients[5].id, scheduledAt: setTime(monday2, 11, 0), endAt: setTime(monday2, 11, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile1.id, patientId: patients[6].id, scheduledAt: setTime(monday2, 15, 0), endAt: setTime(monday2, 15, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Tuesday
  const tuesday2 = getNextWeekday(2, 1)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[7].id, scheduledAt: setTime(tuesday2, 9, 0), endAt: setTime(tuesday2, 9, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[8].id, scheduledAt: setTime(tuesday2, 12, 0), endAt: setTime(tuesday2, 12, 50), status: 'AGENDADO', modality: 'ONLINE' },
    { professionalProfileId: profile2.id, patientId: patients[9].id, scheduledAt: setTime(tuesday2, 18, 0), endAt: setTime(tuesday2, 18, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
  )

  // Wednesday
  const wednesday2 = getNextWeekday(3, 1)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[0].id, scheduledAt: setTime(wednesday2, 10, 0), endAt: setTime(wednesday2, 10, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[1].id, scheduledAt: setTime(wednesday2, 17, 0), endAt: setTime(wednesday2, 17, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Thursday
  const thursday2 = getNextWeekday(4, 1)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[2].id, scheduledAt: setTime(thursday2, 14, 0), endAt: setTime(thursday2, 14, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[3].id, scheduledAt: setTime(thursday2, 19, 0), endAt: setTime(thursday2, 19, 50), status: 'AGENDADO', modality: 'ONLINE' },
  )

  // Friday
  const friday2 = getNextWeekday(5, 1)
  appointments.push(
    { professionalProfileId: profile1.id, patientId: patients[4].id, scheduledAt: setTime(friday2, 10, 0), endAt: setTime(friday2, 10, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
    { professionalProfileId: profile2.id, patientId: patients[5].id, scheduledAt: setTime(friday2, 12, 0), endAt: setTime(friday2, 12, 50), status: 'AGENDADO', modality: 'PRESENCIAL' },
  )

  const createdAppointments = []
  for (const appt of appointments) {
    const created = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        professionalProfileId: appt.professionalProfileId,
        patientId: appt.patientId,
        scheduledAt: appt.scheduledAt,
        endAt: appt.endAt,
        status: appt.status,
        modality: appt.modality,
        confirmedAt: appt.status === 'CONFIRMADO' ? new Date() : null,
      },
    })
    createdAppointments.push(created)
  }

  console.log(`[Appointments] Created ${createdAppointments.length} appointments`)

  // ============================================================================
  // 7. CREATE SAMPLE NOTIFICATIONS
  // ============================================================================

  // Delete existing notifications for seed data to avoid duplicates
  await prisma.notification.deleteMany({
    where: {
      clinicId: clinic.id,
      appointmentId: { in: createdAppointments.map((a) => a.id) },
    },
  })

  const notifications: Array<{
    patientId: string
    appointmentId: string
    type: 'APPOINTMENT_REMINDER' | 'APPOINTMENT_CONFIRMATION'
    channel: 'WHATSAPP' | 'EMAIL'
    status: 'PENDING' | 'SENT' | 'FAILED'
    recipient: string
    subject: string | null
    content: string
    sentAt: Date | null
  }> = []

  // Create notifications for appointments with consenting patients
  for (const appt of createdAppointments.slice(0, 10)) {
    const patient = patients.find((p) => p.id === appt.patientId)
    if (!patient) continue

    // WhatsApp notification if consent given
    if (patient.consentWhatsApp) {
      notifications.push({
        patientId: patient.id,
        appointmentId: appt.id,
        type: 'APPOINTMENT_REMINDER',
        channel: 'WHATSAPP',
        status: appt.status === 'CONFIRMADO' ? 'SENT' : 'PENDING',
        recipient: patient.phone,
        subject: null,
        content: `Ola ${patient.name.split(' ')[0]}! Lembramos que voce tem uma consulta agendada. Por favor, confirme sua presenca.`,
        sentAt: appt.status === 'CONFIRMADO' ? new Date() : null,
      })
    }

    // Email notification if consent given and has email
    if (patient.consentEmail && patient.email) {
      notifications.push({
        patientId: patient.id,
        appointmentId: appt.id,
        type: 'APPOINTMENT_CONFIRMATION',
        channel: 'EMAIL',
        status: appt.status === 'CONFIRMADO' ? 'SENT' : 'PENDING',
        recipient: patient.email,
        subject: 'Confirmacao de Consulta - Clinica Demo',
        content: `Prezado(a) ${patient.name},\n\nSua consulta foi ${appt.status === 'CONFIRMADO' ? 'confirmada' : 'agendada'}.\n\nAtenciosamente,\nClinica Demo`,
        sentAt: appt.status === 'CONFIRMADO' ? new Date() : null,
      })
    }
  }

  // Add some failed notifications for testing
  const failedPatient = patients.find((p) => p.consentWhatsApp)
  if (failedPatient && createdAppointments[15]) {
    notifications.push({
      patientId: failedPatient.id,
      appointmentId: createdAppointments[15].id,
      type: 'APPOINTMENT_REMINDER',
      channel: 'WHATSAPP',
      status: 'FAILED',
      recipient: failedPatient.phone,
      subject: null,
      content: `Ola ${failedPatient.name.split(' ')[0]}! Lembramos que voce tem uma consulta agendada.`,
      sentAt: null,
    })
  }

  for (const notif of notifications) {
    await prisma.notification.create({
      data: {
        clinicId: clinic.id,
        patientId: notif.patientId,
        appointmentId: notif.appointmentId,
        type: notif.type,
        channel: notif.channel,
        status: notif.status,
        recipient: notif.recipient,
        subject: notif.subject,
        content: notif.content,
        sentAt: notif.sentAt,
        failedAt: notif.status === 'FAILED' ? new Date() : null,
        failureReason: notif.status === 'FAILED' ? 'Numero de telefone invalido' : null,
        attempts: notif.status === 'FAILED' ? 3 : notif.status === 'SENT' ? 1 : 0,
      },
    })
  }

  console.log(`[Notifications] Created ${notifications.length} notifications`)

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
  console.log(`  - 1 Admin user: admin@clinicademo.com / admin`)
  console.log(`  - 2 Professional users:`)
  console.log(`      * ${professional1.email} / senha123`)
  console.log(`      * ${professional2.email} / senha123`)
  console.log(`  - ${availabilitySchedule1.length + availabilitySchedule2.length} Availability rules`)
  console.log(`  - ${patients.length} Patients (varied consent settings)`)
  console.log(`  - ${createdAppointments.length} Appointments (next 2 weeks)`)
  console.log(`  - ${notifications.length} Notifications`)
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
