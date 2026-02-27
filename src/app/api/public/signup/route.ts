import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import { z } from "zod"

const signupSchema = z.object({
  clinicName: z.string().min(2, "Nome da clinica deve ter pelo menos 2 caracteres"),
  ownerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  phone: z.string().min(10, "Telefone invalido"),
  specialty: z.string().min(2, "Especialidade deve ter pelo menos 2 caracteres"),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { clinicName, ownerName, email, password, phone, specialty } = parsed.data

    const existingUser = await prisma.user.findFirst({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Ja existe uma conta com este email" },
        { status: 409 }
      )
    }

    let slug = slugify(clinicName)
    const existingSlug = await prisma.clinic.findUnique({ where: { slug } })
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const passwordHash = await hashPassword(password)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    let stripeCustomerId: string | null = null
    if (process.env.STRIPE_SECRET_KEY) {
      const { stripe } = await import("@/lib/stripe")
      const stripeCustomer = await stripe.customers.create({
        email,
        name: clinicName,
        metadata: { ownerName },
      })
      stripeCustomerId = stripeCustomer.id
    }

    const result = await prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: clinicName,
          slug,
          phone,
          subscriptionStatus: "trialing",
          trialEndsAt,
          stripeCustomerId,
        },
      })

      const user = await tx.user.create({
        data: {
          clinicId: clinic.id,
          name: ownerName,
          email,
          passwordHash,
          role: "ADMIN",
        },
      })

      await tx.professionalProfile.create({
        data: {
          userId: user.id,
          specialty,
        },
      })

      return { clinic, user }
    })

    return NextResponse.json(
      {
        clinicId: result.clinic.id,
        userId: result.user.id,
        slug: result.clinic.slug,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "Erro interno ao criar conta. Tente novamente." },
      { status: 500 }
    )
  }
}
