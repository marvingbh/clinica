import { describe, it, expect } from "vitest"
import {
  buildIcsFeed,
  escapeIcsText,
  foldIcsLine,
  formatIcsDateLocal,
  icsUid,
  type IcsEvent,
} from "./ics"

const TZ = "America/Sao_Paulo"

function ev(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: icsUid("appt-1"),
    title: "Atendimento — Clínica X",
    start: new Date("2026-06-15T17:00:00Z"), // 14:00 SP
    end: new Date("2026-06-15T17:50:00Z"),
    cancelled: false,
    ...overrides,
  }
}

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne")
  })
})

describe("foldIcsLine", () => {
  it("leaves short lines untouched", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short")
  })

  it("folds lines longer than 75 octets with CRLF + space", () => {
    const long = "SUMMARY:" + "x".repeat(100)
    const folded = foldIcsLine(long)
    expect(folded).toContain("\r\n ")
    const firstLine = folded.split("\r\n")[0]
    expect(Buffer.from(firstLine, "utf8").length).toBeLessThanOrEqual(75)
  })
})

describe("formatIcsDateLocal", () => {
  it("renders UTC instant as São Paulo wall clock (UTC-3)", () => {
    expect(formatIcsDateLocal(new Date("2026-06-15T17:00:00Z"), TZ)).toBe("20260615T140000")
  })
})

describe("icsUid", () => {
  it("is stable per appointment id", () => {
    expect(icsUid("abc")).toBe("abc@clinica")
  })
})

describe("buildIcsFeed", () => {
  const now = new Date("2026-06-10T12:00:00Z")

  it("produces a valid VCALENDAR with PRODID and X-WR-CALNAME", () => {
    const feed = buildIcsFeed({ calendarName: "Agenda", timezone: TZ, events: [ev()], now })
    expect(feed).toContain("BEGIN:VCALENDAR")
    expect(feed).toContain("END:VCALENDAR")
    expect(feed).toContain("PRODID:-//Clinica//Calendar Sync//PT-BR")
    expect(feed).toContain("X-WR-CALNAME:Agenda")
  })

  it("pairs BEGIN/END VEVENT for each event", () => {
    const feed = buildIcsFeed({
      calendarName: "Agenda",
      timezone: TZ,
      events: [ev(), ev({ uid: icsUid("appt-2") })],
      now,
    })
    expect((feed.match(/BEGIN:VEVENT/g) || []).length).toBe(2)
    expect((feed.match(/END:VEVENT/g) || []).length).toBe(2)
  })

  it("renders DTSTART in local time", () => {
    const feed = buildIcsFeed({ calendarName: "Agenda", timezone: TZ, events: [ev()], now })
    expect(feed).toContain("DTSTART:20260615T140000")
    expect(feed).toContain("DTEND:20260615T145000")
  })

  it("marks cancelled events with STATUS:CANCELLED", () => {
    const feed = buildIcsFeed({
      calendarName: "Agenda",
      timezone: TZ,
      events: [ev({ cancelled: true })],
      now,
    })
    expect(feed).toContain("STATUS:CANCELLED")
  })

  it("uses a stable UID = {appointmentId}@clinica", () => {
    const feed = buildIcsFeed({ calendarName: "Agenda", timezone: TZ, events: [ev()], now })
    expect(feed).toContain("UID:appt-1@clinica")
  })

  it("escapes special characters in the summary", () => {
    const feed = buildIcsFeed({
      calendarName: "Agenda",
      timezone: TZ,
      events: [ev({ title: "Reunião; equipe, sala" })],
      now,
    })
    expect(feed).toContain("SUMMARY:Reunião\\; equipe\\, sala")
  })
})
