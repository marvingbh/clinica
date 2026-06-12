import type { CalendarClient, GoogleEventBody, BusyInterval } from "../types"
import { CalendarAuthError, CalendarRateLimitError, CalendarNotFoundError } from "../types"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const CALENDAR_API = "https://www.googleapis.com/calendar/v3"

export interface GoogleClientConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
}

/**
 * Thin REST client for Google Calendar over `fetch` (no `googleapis` SDK — too
 * heavy for serverless). Refreshes the access token on demand and caches it in
 * memory for the lifetime of the instance (one execution). Classifies HTTP
 * errors into the domain error types the processor reacts to.
 */
export class GoogleCalendarClient implements CalendarClient {
  private config: GoogleClientConfig
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0

  constructor(config: GoogleClientConfig) {
    this.config = config
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessToken && now < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (res.status === 400 || res.status === 401) {
      // invalid_grant et al. → revoked / expired refresh token.
      throw new CalendarAuthError("Falha ao renovar token de acesso do Google")
    }
    if (!res.ok) {
      throw new Error(`Token refresh falhou: HTTP ${res.status}`)
    }

    const json = (await res.json()) as { access_token: string; expires_in: number }
    this.accessToken = json.access_token
    this.accessTokenExpiresAt = Date.now() + json.expires_in * 1000
    return this.accessToken
  }

  private async call(
    path: string,
    init: RequestInit & { query?: Record<string, string> } = {}
  ): Promise<Response> {
    const token = await this.getAccessToken()
    const url = new URL(`${CALENDAR_API}${path}`)
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)

    const res = await fetch(url.toString(), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    })

    if (res.status === 401) throw new CalendarAuthError()
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After")
      throw new CalendarRateLimitError(
        "Limite de requisições do Google atingido",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
      )
    }
    if (res.status === 404 || res.status === 410) throw new CalendarNotFoundError()
    if (res.status >= 500) throw new Error(`Google API ${res.status}`)
    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`)
    return res
  }

  async insertEvent(calendarId: string, body: GoogleEventBody): Promise<{ id: string }> {
    const res = await this.call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { id: string }
    return { id: json.id }
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    body: GoogleEventBody
  ): Promise<void> {
    await this.call(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "PATCH", body: JSON.stringify(body) }
    )
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.call(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    )
  }

  async findEventsByAppointmentId(
    calendarId: string,
    appointmentId: string
  ): Promise<{ id: string }[]> {
    const res = await this.call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "GET",
      query: {
        privateExtendedProperty: `clinicaAppointmentId=${appointmentId}`,
        showDeleted: "false",
        maxResults: "5",
      },
    })
    const json = (await res.json()) as { items?: { id: string }[] }
    return (json.items ?? []).map((i) => ({ id: i.id }))
  }

  async listCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]> {
    const res = await this.call(`/users/me/calendarList`, { method: "GET" })
    const json = (await res.json()) as {
      items?: { id: string; summary: string; primary?: boolean }[]
    }
    return (json.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
    }))
  }

  async freeBusy(
    calendarIds: string[],
    timeMin: Date,
    timeMax: Date
  ): Promise<BusyInterval[]> {
    const res = await this.call(`/freeBusy`, {
      method: "POST",
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    })
    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>
    }
    const intervals: BusyInterval[] = []
    for (const cal of Object.values(json.calendars ?? {})) {
      for (const b of cal.busy ?? []) {
        intervals.push({ start: new Date(b.start), end: new Date(b.end) })
      }
    }
    return intervals
  }

  /**
   * Exchanges an authorization `code` for tokens (callback flow). Returns the
   * refresh token (when Google issues one), the access token, and granted
   * scopes. `access_type=offline` + `prompt=consent` ensures a refresh token.
   */
  static async exchangeCode(params: {
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
  }): Promise<{ refreshToken: string | null; accessToken: string; scopes: string[] }> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
      }),
    })
    if (!res.ok) {
      throw new Error(`Troca de código falhou: HTTP ${res.status}`)
    }
    const json = (await res.json()) as {
      refresh_token?: string
      access_token: string
      scope?: string
    }
    return {
      refreshToken: json.refresh_token ?? null,
      accessToken: json.access_token,
      scopes: json.scope ? json.scope.split(" ") : [],
    }
  }

  /** Fetches the user's Google account email (for display). */
  static async fetchAccountEmail(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return null
      const json = (await res.json()) as { email?: string }
      return json.email ?? null
    } catch {
      return null
    }
  }

  /** Best-effort token revocation on disconnect. Never throws. */
  static async revokeToken(refreshToken: string): Promise<void> {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      })
    } catch {
      // ignore — local cleanup proceeds regardless
    }
  }
}
