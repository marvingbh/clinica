const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function investigateElenasAppointment() {
  try {
    // Data de hoje (22/05/2026)
    const today = new Date('2026-05-22')
    const startOfDay = new Date(today.setHours(0, 0, 0, 0))
    const endOfDay = new Date(today.setHours(23, 59, 59, 999))

    console.log('🔍 Procurando appointments de hoje (22/05/2026)...')

    // 1. Appointments deletados recentemente (se há logs de audit)
    console.log('\n📋 Appointments de hoje restantes:')
    const todayAppointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        patient: { select: { name: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
        group: { select: { name: true } }
      },
      orderBy: { scheduledAt: 'asc' }
    })

    todayAppointments.forEach(apt => {
      const time = apt.scheduledAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const patient = apt.patient?.name || apt.title || '(sem paciente)'
      const prof = apt.professionalProfile.user.name
      const group = apt.group?.name ? ` [${apt.group.name}]` : ''
      console.log(`  ${time} - ${patient} com ${prof}${group} (status: ${apt.status})`)
    })

    // 2. Therapy groups que deveriam ter sessão hoje
    console.log('\n🏥 Therapy Groups ativos:')
    const activeGroups = await prisma.therapyGroup.findMany({
      where: { isActive: true },
      include: {
        professionalProfile: { select: { user: { select: { name: true } } } },
        memberships: {
          where: {
            leaveDate: null // membros ativos
          },
          include: {
            patient: { select: { name: true } }
          }
        }
      }
    })

    // Verificar se algum grupo deveria ter sessão hoje (quinta-feira = 4)
    const todayWeekday = today.getDay() // 0=domingo, 4=quinta

    activeGroups.forEach(group => {
      const prof = group.professionalProfile.user.name
      const memberCount = group.memberships.length
      const isToday = group.dayOfWeek === todayWeekday
      const members = group.memberships.map(m => m.patient.name).join(', ')

      console.log(`  ${group.name} - ${prof} - ${group.dayOfWeek === todayWeekday ? '📅 HOJE' : `Dia ${group.dayOfWeek}`} às ${group.startTime}`)
      console.log(`    Membros (${memberCount}): ${members || '(nenhum)'}`)

      if (isToday && group.startTime.startsWith('10:')) {
        console.log(`    ⚠️  POSSÍVEL GRUPO DA ELENA: ${group.name} às ${group.startTime}`)
      }
    })

    // 3. Appointments órfãos (sem paciente nem grupo)
    console.log('\n👻 Appointments órfãos (sem paciente nem grupo):')
    const orphanAppointments = await prisma.appointment.findMany({
      where: {
        AND: [
          { patientId: null },
          { groupId: null },
          { sessionGroupId: null }
        ],
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        professionalProfile: { select: { user: { select: { name: true } } } }
      }
    })

    orphanAppointments.forEach(apt => {
      const time = apt.scheduledAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const prof = apt.professionalProfile.user.name
      console.log(`  ${time} - ${apt.title || '(sem título)'} com ${prof}`)
    })

    // 4. Audit logs recentes (se existirem)
    console.log('\n📊 Logs de auditoria recentes:')
    try {
      const recentLogs = await prisma.auditLog.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // últimas 2 horas
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })

      recentLogs.forEach(log => {
        const time = log.createdAt.toLocaleTimeString('pt-BR')
        console.log(`  ${time} - ${log.action} ${log.entityType} ${log.entityId} (${log.userId})`)
      })
    } catch (error) {
      console.log('  (Logs de auditoria não disponíveis)')
    }

  } catch (error) {
    console.error('Erro na investigação:', error)
  } finally {
    await prisma.$disconnect()
  }
}

investigateElenasAppointment()