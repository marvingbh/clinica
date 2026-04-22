import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, validatePasswordStrength } from "@/lib/password"
import { z } from "zod"
import { checkRateLimit, RATE_LIMIT_CONFIGS, RateLimitUnavailableError } from "@/lib/rate-limit"

const signupSchema = z.object({
  clinicName: z.string().min(2, "Nome da clinica deve ter pelo menos 2 caracteres").max(200),
  ownerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  email: z.string().email("Email invalido").max(200),
  password: z.string().min(12, "Senha deve ter pelo menos 12 caracteres").max(200),
  phone: z.string().min(10, "Telefone invalido").max(30),
  specialty: z.string().min(2, "Especialidade deve ter pelo menos 2 caracteres").max(100),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function POST(req: NextRequest) {
  // B6 rate limit — fail-closed. Caps clinic-creation flood + bcrypt CPU DoS.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  try {
    const rl = await checkRateLimit(`signup:${ip}`, RATE_LIMIT_CONFIGS.signup)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde uma hora." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } },
      )
    }
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return NextResponse.json({ error: "Servico temporariamente indisponivel" }, { status: 503 })
    }
    throw err
  }

  try {
    const body = await req.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { clinicName, ownerName, email: rawEmail, password, phone, specialty } = parsed.data
    const email = rawEmail.toLowerCase()

    // Password strength check (M3)
    const strength = validatePasswordStrength(password)
    if (!strength.ok) {
      return NextResponse.json({ error: strength.reason }, { status: 400 })
    }

    // B6: no pre-check of existing email (account-enumeration oracle). Rely on
    // the `@@unique([clinicId, email])` constraint to fail the transaction if
    // the email is already registered in THIS clinic. A different clinic with
    // the same email is legitimate and should not collide here.

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

    try {
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
    } catch (err) {
      // P2002 = unique constraint. Return a generic success-ish message to
      // avoid leaking which emails are registered — a human can still complete
      // the flow via password recovery.
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        return NextResponse.json(
          { message: "Se o e-mail esta disponivel, sua conta foi criada. Caso contrario, verifique seu e-mail." },
          { status: 202 }
        )
      }
      throw err
    }
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "Erro interno ao criar conta. Tente novamente." },
      { status: 500 }
    )
  }
}
