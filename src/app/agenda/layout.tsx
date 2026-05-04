import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DEFAULT_AGENDA_COLORS, resolveAgendaColors } from "@/lib/clinic/colors/schema"
import { AgendaProvider } from "./context/AgendaContext"
import { AgendaColorsProvider } from "./components/AgendaColorsProvider"

/**
 * Server Component layout — fetches the clinic's agenda color preferences
 * with the authenticated user's session and passes the resolved object down
 * to the client `AgendaColorsProvider`.
 *
 * Implementing this as a server fetch (rather than a client mount + useEffect)
 * eliminates the Flash of Default Colors and removes another `useEffect`
 * (forbidden by CLAUDE.md). It also means PROFESSIONAL users render with the
 * correct clinic colors on first paint — they get them from this layout, not
 * from the admin-gated settings endpoint.
 */
export default async function AgendaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const clinic =
    session?.user?.clinicId
      ? await prisma.clinic.findUnique({
          where: { id: session.user.clinicId },
          select: { agendaColors: true },
        })
      : null
  const colors = clinic
    ? resolveAgendaColors(clinic.agendaColors)
    : DEFAULT_AGENDA_COLORS

  return (
    <AgendaProvider>
      <AgendaColorsProvider value={colors}>{children}</AgendaColorsProvider>
    </AgendaProvider>
  )
}
