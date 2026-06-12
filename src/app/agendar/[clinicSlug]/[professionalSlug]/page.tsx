import { BookingWizard } from "../components/BookingWizard"

/**
 * Deep-link variant of the public booking page that pre-selects a professional
 * (e.g. a link in an Instagram bio), skipping the professional-picker step.
 */
export default async function BookingDeepLinkPage({
  params,
}: {
  params: Promise<{ clinicSlug: string; professionalSlug: string }>
}) {
  const { clinicSlug, professionalSlug } = await params
  return <BookingWizard clinicSlug={clinicSlug} initialProfessionalSlug={professionalSlug} />
}
