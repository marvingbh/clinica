import { buildVideoToken } from "./video-tokens"
import { renderTemplate, type TemplateVariables } from "@/lib/notifications/templates"

/**
 * Pure construction of the patient `{{videoLink}}` value and the helper that
 * renders a template with it while removing any line where the variable was
 * left unresolved (RN-07). External `meetingUrl` takes priority (RN-06).
 */

/** Absolute patient URL: `${baseUrl}/teleconsulta/${token}`. */
export function buildPatientVideoUrl(
  baseUrl: string,
  appointmentId: string,
  secret: string
): string {
  return `${baseUrl}/teleconsulta/${buildVideoToken(appointmentId, secret)}`
}

export interface ResolveVideoLinkArgs {
  appointment: {
    id: string
    type: string
    modality: string | null
    meetingUrl: string | null
  }
  clinic: { telehealthEnabled: boolean }
  config: { configured: boolean }
  baseUrl: string
  secret: string
}

/**
 * Decide the value of `{{videoLink}}` for a notification (RN-06/RN-07).
 * Returns null when teleconsulta does not apply, so the caller strips the line.
 */
export function resolveVideoLinkForNotification(
  args: ResolveVideoLinkArgs
): string | null {
  const { appointment, clinic, config, baseUrl, secret } = args
  if (appointment.type !== "CONSULTA" || appointment.modality !== "ONLINE") {
    return null
  }
  // External link wins over the built-in room (RN-06).
  if (appointment.meetingUrl) {
    return appointment.meetingUrl
  }
  if (!clinic.telehealthEnabled || !config.configured) {
    return null
  }
  return buildPatientVideoUrl(baseUrl, appointment.id, secret)
}

/**
 * Remove any line that still contains the literal `{{videoLink}}` placeholder
 * after rendering (RN-07). Other lines, including legitimately empty ones, are
 * preserved.
 */
export function stripUnresolvedVideoLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.includes("{{videoLink}}"))
    .join("\n")
}

/**
 * Single render+strip helper so the 4 send points never duplicate the pattern.
 * When `videoLink` is provided it is substituted; otherwise the line carrying
 * the placeholder is dropped.
 */
export function renderWithVideoLink(
  content: string,
  variables: TemplateVariables
): string {
  const rendered = renderTemplate(content, variables)
  return stripUnresolvedVideoLines(rendered)
}
