import { BookingWizard } from "./components/BookingWizard"

/**
 * Public self-booking page. Server component: resolves the route params and
 * hands off to the client wizard, which fetches clinic data from the public API.
 */
export default async function BookingPage({
  params,
}: {
  params: Promise<{ clinicSlug: string }>
}) {
  const { clinicSlug } = await params
  return <BookingWizard clinicSlug={clinicSlug} />
}
