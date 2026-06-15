/**
 * Canonical list of public (unauthenticated) page-route prefixes.
 *
 * Single source of truth shared by the NextAuth middleware (auth.config.ts) and
 * the chrome components (sidebar, headers, app-shell) that must hide navigation
 * on public pages. Keep this in sync when a new patient-facing public flow is
 * added — do NOT duplicate the list elsewhere.
 *
 * Note: "/f/" intentionally keeps the trailing slash so it matches the public
 * form-fill page /f/[token] WITHOUT colliding with /financeiro or /formularios.
 */
export const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/signup",
  "/confirm",
  "/cancel",
  "/intake",
  "/agendar",
  "/paciente",
  "/pagar",
  "/oferta",
  "/assinar",
  "/escala",
  "/verificar",
  "/teleconsulta",
  "/f/",
] as const

/**
 * True when `pathname` belongs to a public page route. The home page ("/") is
 * handled separately by callers because it is public only when logged out.
 */
export function isPublicPagePath(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
