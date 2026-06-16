import Stripe from "stripe"
import { NextResponse } from "next/server"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set")
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }
  return _stripe
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe]
  },
})

/** True when the platform Stripe secret key is configured on the server. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Standard JSON 503 for API routes when Stripe isn't configured — returning a
 * proper body (not an unhandled throw → empty 500) keeps clients from crashing
 * on `res.json()` with "Unexpected end of JSON input".
 */
export function stripeNotConfiguredResponse() {
  return NextResponse.json(
    {
      error:
        "Pagamento online indisponível: a integração Stripe da plataforma ainda não foi ativada. " +
        "Isso é configurado uma única vez pelo operador do sistema (chave da plataforma) — não é a chave de cada clínica. " +
        "Fale com o administrador do sistema.",
    },
    { status: 503 }
  )
}
