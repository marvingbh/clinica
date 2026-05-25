const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function restoreElenasAppointment() {
  try {
    // Dados do agendamento perdido
    const groupName = "Atendimento em dupla - Laís e Ana Cecília"
    const todayDate = new Date('2026-05-22')
    const appointmentTime = '10:15'
    const duration = 90 // minutos padrão

    console.log('🔍 Procurando o grupo perdido...')

    // Encontrar o therapy group
    const group = await prisma.therapyGroup.findFirst({
      where: {
        name: groupName
      },
      include: {
        professionalProfile: {
          select: {
            id: true,
            user: { select: { name: true } }
          }
        },
        memberships: {
          where: { leaveDate: null },
          include: {
            patient: { select: { id: true, name: true } }
          }
        }
      }
    })

    if (!group) {
      console.log('❌ Grupo não encontrado!')
      return
    }

    console.log(`✅ Grupo encontrado: ${group.name}`)
    console.log(`   Profissional: ${group.professionalProfile.user.name}`)
    console.log(`   Membros ativos: ${group.memberships.length}`)

    group.memberships.forEach(member => {
      console.log(`   - ${member.patient.name} (ID: ${member.patient.id})`)
    })

    // Verificar se já existem appointments para hoje
    const todayStart = new Date(todayDate)
    todayStart.setHours(10, 15, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setMinutes(todayStart.getMinutes() + duration)

    console.log(`\n🔍 Verificando appointments existentes para ${todayStart.toLocaleString('pt-BR')}...`)

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        groupId: group.id,
        scheduledAt: todayStart
      },
      include: {
        patient: { select: { name: true } }
      }
    })

    if (existingAppointments.length > 0) {
      console.log(`⚠️  Já existem ${existingAppointments.length} appointments:`)
      existingAppointments.forEach(apt => {
        console.log(`   - ${apt.patient?.name || '(sem paciente)'} (status: ${apt.status})`)
      })
      console.log('\n❓ Os appointments já existem. Talvez o problema seja na visualização?')
      return
    }

    console.log('❌ Nenhum appointment encontrado para hoje.')
    console.log('\n💡 Elena provavelmente deletou os appointments. Vamos recriar?')

    // Aqui poderíamos recriar os appointments, mas vou apenas mostrar o que seria necessário
    console.log('\n📋 Para restaurar, seria necessário criar:')
    group.memberships.forEach(member => {
      console.log(`   ✓ Appointment para ${member.patient.name}`)
      console.log(`     - Data: ${todayStart.toLocaleString('pt-BR')}`)
      console.log(`     - Duração: ${duration} min`)
      console.log(`     - Grupo: ${group.name}`)
      console.log(`     - Profissional: ${group.professionalProfile.user.name}`)
      console.log('')
    })

  } catch (error) {
    console.error('Erro na restauração:', error)
  } finally {
    await prisma.$disconnect()
  }
}

restoreElenasAppointment()