/**
 * Thin fetch wrapper with 401 handling so mid-session revocation doesn't
 * silently eat a user's work.
 *
 * - Mutations that come back 401 stash their body to sessionStorage and
 *   redirect the user to /login. On return, call sites can pull the draft
 *   back via `popResumeDraft`. No auto-retry (never safe for mutations).
 * - Responses whose content-type isn't JSON after auth are treated as
 *   auth-lost (e.g. edge middleware redirected to /login HTML).
 */

const RESUME_KEY_PREFIX = "apiFetch:resume:"

export interface ApiFetchOptions extends RequestInit {
  /** When set, a 401 on a mutation stashes this tag + body to sessionStorage. */
  resumeTag?: string
}

export class ApiFetchAuthError extends Error {
  constructor() {
    super("Sessao expirada. Faca login novamente.")
    this.name = "ApiFetchAuthError"
  }
}

function stashResumeDraft(tag: string, init: RequestInit): string {
  const key = `${RESUME_KEY_PREFIX}${tag}:${Date.now()}`
  try {
    const body =
      init.body && typeof init.body === "string" ? init.body : null
    sessionStorage.setItem(
      key,
      JSON.stringify({ tag, method: init.method ?? "GET", body }),
    )
  } catch {
    // sessionStorage unavailable (private mode) — skip
  }
  return key
}

export function popResumeDraft(tag: string): unknown | null {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith(`${RESUME_KEY_PREFIX}${tag}:`)) continue
      const raw = sessionStorage.getItem(key)
      if (raw) {
        sessionStorage.removeItem(key)
        const parsed = JSON.parse(raw)
        return parsed.body ? JSON.parse(parsed.body) : null
      }
    }
  } catch {
    // ignore
  }
  return null
}

function redirectToLogin(resumeKey?: string) {
  if (typeof window === "undefined") return
  const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search)
  const resume = resumeKey ? `&resume=${encodeURIComponent(resumeKey)}` : ""
  window.location.href = `/login?callbackUrl=${callbackUrl}${resume}`
}

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchOptions = {}): Promise<Response> {
  const isMutation = init.method && init.method !== "GET" && init.method !== "HEAD"

  let response: Response
  try {
    response = await fetch(input, init)
  } catch (err) {
    throw err
  }

  if (response.status === 401) {
    let resumeKey: string | undefined
    if (isMutation && init.resumeTag) {
      resumeKey = stashResumeDraft(init.resumeTag, init)
    }
    redirectToLogin(resumeKey)
    throw new ApiFetchAuthError()
  }

  // If server returned HTML after auth (e.g. edge redirect), treat as auth lost.
  const contentType = response.headers.get("content-type") ?? ""
  if (response.ok && !contentType.includes("application/json") && !contentType.includes("text/plain") && !contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    if (typeof document !== "undefined") {
      // HTML served where we expected JSON — most likely a login redirect
      redirectToLogin()
      throw new ApiFetchAuthError()
    }
  }

  return response
}
