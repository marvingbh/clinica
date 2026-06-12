import { formatIcsDateLocal } from "./tz-format"

export { formatIcsDateLocal }

export interface IcsEvent {
  uid: string
  title: string
  start: Date
  end: Date
  cancelled: boolean
}

export interface BuildIcsOptions {
  calendarName: string
  timezone: string
  events: IcsEvent[]
  now: Date
}

/** Escapes text per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n")
}

/**
 * Folds a content line at 75 octets, continuation lines starting with a single
 * space (RFC 5545 §3.1). Works on UTF-8 byte length, not code points.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8")
  if (bytes.length <= 75) return line

  const chunks: string[] = []
  let start = 0
  // First line: 75 octets. Continuation lines: 74 octets (1 for leading space).
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Avoid splitting a multi-byte UTF-8 sequence: back off while the byte at
    // `end` is a continuation byte (0b10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    chunks.push(bytes.subarray(start, end).toString("utf8"))
    start = end
    limit = 74
  }
  return chunks.join("\r\n ")
}

function line(key: string, value: string): string {
  return foldIcsLine(`${key}:${value}`)
}

/**
 * Builds a complete VCALENDAR feed (read-only) for the given events. Dates are
 * rendered as floating local time in `timezone` (Brazil has no DST, so this is
 * unambiguous). Cancelled events get STATUS:CANCELLED so subscribers drop them.
 */
export function buildIcsFeed(opts: BuildIcsOptions): string {
  const dtstamp = formatIcsDateLocal(opts.now, opts.timezone)
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clinica//Calendar Sync//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", escapeIcsText(opts.calendarName)),
    line("X-WR-TIMEZONE", opts.timezone),
  ]

  for (const ev of opts.events) {
    lines.push("BEGIN:VEVENT")
    lines.push(line("UID", ev.uid))
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART:${formatIcsDateLocal(ev.start, opts.timezone)}`)
    lines.push(`DTEND:${formatIcsDateLocal(ev.end, opts.timezone)}`)
    lines.push(line("SUMMARY", escapeIcsText(ev.title)))
    lines.push(`STATUS:${ev.cancelled ? "CANCELLED" : "CONFIRMED"}`)
    if (ev.cancelled) lines.push("TRANSP:TRANSPARENT")
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  // RFC 5545 lines are CRLF-terminated.
  return lines.join("\r\n") + "\r\n"
}

/** Stable UID for an appointment's ICS event. */
export function icsUid(appointmentId: string): string {
  return `${appointmentId}@clinica`
}
