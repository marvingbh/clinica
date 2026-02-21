import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

async function main() {
  console.log("Seeding SaaS data (plans + super admin)...")

  // Seed plans
  const plans = [
    {
      name: "Basic",
      slug: "basic",
      stripePriceId: "price_basic_placeholder",
      maxProfessionals: 2,
      priceInCents: 9900,
    },
    {
      name: "Pro",
      slug: "pro",
      stripePriceId: "price_pro_placeholder",
      maxProfessionals: 10,
      priceInCents: 19900,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      stripePriceId: "price_enterprise_placeholder",
      maxProfessionals: -1,
      priceInCents: 39900,
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        stripePriceId: plan.stripePriceId,
        maxProfessionals: plan.maxProfessionals,
        priceInCents: plan.priceInCents,
      },
      create: plan,
    })
    console.log(`  [Plan] ${plan.name}: R$${(plan.priceInCents / 100).toFixed(2)}, max ${plan.maxProfessionals === -1 ? "ilimitado" : plan.maxProfessionals} profissionais`)
  }

  // Seed super admin
  const superAdminEmail = "superadmin@clinica.com"
  const passwordHash = await bcrypt.hash("admin", SALT_ROUNDS)

  await prisma.superAdmin.upsert({
    where: { email: superAdminEmail },
    update: { passwordHash, name: "Super Admin" },
    create: {
      email: superAdminEmail,
      passwordHash,
      name: "Super Admin",
    },
  })

  console.log(`  [SuperAdmin] ${superAdminEmail} / admin`)
  console.log("")
  console.log("SaaS seed completed.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
