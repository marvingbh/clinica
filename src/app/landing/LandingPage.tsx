"use client"

import { LandingNav, LandingHero } from "./LandingHero"
import { LandingLogos, LandingFeatures } from "./LandingFeatures"
import {
  LandingFacts,
  LandingTestimonial,
  LandingPricing,
  LandingFaq,
  LandingFinalCta,
  LandingFooter,
} from "./LandingConversion"

/** Public landing page — shown at / when unauthenticated.
 *  Uses the Clinica Landing Page design spec. */
export function LandingPage() {
  return (
    <main className="bg-card text-ink-800">
      <LandingNav />
      <LandingHero />
      <LandingLogos />
      <LandingFeatures />
      <LandingFacts />
      <LandingTestimonial />
      <LandingPricing />
      <LandingFaq />
      <LandingFinalCta />
      <LandingFooter />
    </main>
  )
}
