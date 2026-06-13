import { describe, it, expect } from "vitest"
import {
  computeJoinWindow,
  resolveJoinState,
  JOIN_WINDOW_BEFORE_MIN,
  JOIN_WINDOW_GRACE_AFTER_MIN,
  type JoinStateAppointment,
} from "./join-window"

const SCHEDULED = new Date("2026-06-11T14:00:00.000Z")
const END = new Date("2026-06-11T14:50:00.000Z")

const enabledClinic = { telehealthEnabled: true }
const configuredCfg = { configured: true }

function appt(over: Partial<JoinStateAppointment> = {}): JoinStateAppointment {
  return {
    type: "CONSULTA",
    modality: "ONLINE",
    status: "AGENDADO",
    scheduledAt: SCHEDULED,
    endAt: END,
    ...over,
  }
}

describe("computeJoinWindow", () => {
  it("opens exactly 15 min before scheduledAt", () => {
    const { opensAt } = computeJoinWindow(SCHEDULED, END)
    expect(opensAt.getTime()).toBe(SCHEDULED.getTime() - JOIN_WINDOW_BEFORE_MIN * 60 * 1000)
  })

  it("closes exactly endAt + 30 min", () => {
    const { closesAt } = computeJoinWindow(SCHEDULED, END)
    expect(closesAt.getTime()).toBe(END.getTime() + JOIN_WINDOW_GRACE_AFTER_MIN * 60 * 1000)
  })
})

describe("resolveJoinState", () => {
  it("OK inside the window", () => {
    const now = new Date(SCHEDULED.getTime())
    expect(resolveJoinState(appt(), enabledClinic, configuredCfg, now).kind).toBe("OK")
  })

  it("TOO_EARLY before the window opens", () => {
    const now = new Date(SCHEDULED.getTime() - 20 * 60 * 1000)
    const state = resolveJoinState(appt(), enabledClinic, configuredCfg, now)
    expect(state.kind).toBe("TOO_EARLY")
    if (state.kind === "TOO_EARLY") {
      expect(state.opensAt.getTime()).toBe(SCHEDULED.getTime() - 15 * 60 * 1000)
      expect(state.scheduledAt.getTime()).toBe(SCHEDULED.getTime())
    }
  })

  it("OK exactly at the window open boundary", () => {
    const now = new Date(SCHEDULED.getTime() - 15 * 60 * 1000)
    expect(resolveJoinState(appt(), enabledClinic, configuredCfg, now).kind).toBe("OK")
  })

  it("ENDED after the close boundary", () => {
    const now = new Date(END.getTime() + 31 * 60 * 1000)
    expect(resolveJoinState(appt(), enabledClinic, configuredCfg, now).kind).toBe("ENDED")
  })

  it("ENDED when status is FINALIZADO even inside the window", () => {
    const now = new Date(SCHEDULED.getTime())
    expect(
      resolveJoinState(appt({ status: "FINALIZADO" }), enabledClinic, configuredCfg, now).kind
    ).toBe("ENDED")
  })

  it("CANCELLED for all three CANCELADO_* statuses", () => {
    const now = new Date(SCHEDULED.getTime())
    for (const status of ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"]) {
      expect(resolveJoinState(appt({ status }), enabledClinic, configuredCfg, now).kind).toBe(
        "CANCELLED"
      )
    }
  })

  it("NOT_ONLINE for PRESENCIAL, null modality, or non-CONSULTA type", () => {
    const now = new Date(SCHEDULED.getTime())
    expect(
      resolveJoinState(appt({ modality: "PRESENCIAL" }), enabledClinic, configuredCfg, now).kind
    ).toBe("NOT_ONLINE")
    expect(
      resolveJoinState(appt({ modality: null }), enabledClinic, configuredCfg, now).kind
    ).toBe("NOT_ONLINE")
    expect(
      resolveJoinState(appt({ type: "TAREFA" }), enabledClinic, configuredCfg, now).kind
    ).toBe("NOT_ONLINE")
  })

  it("DISABLED when clinic toggle off", () => {
    const now = new Date(SCHEDULED.getTime())
    expect(
      resolveJoinState(appt(), { telehealthEnabled: false }, configuredCfg, now).kind
    ).toBe("DISABLED")
  })

  it("DISABLED when platform not configured", () => {
    const now = new Date(SCHEDULED.getTime())
    expect(
      resolveJoinState(appt(), enabledClinic, { configured: false }, now).kind
    ).toBe("DISABLED")
  })

  it("reschedule moves the window with the same token (recompute from live record)", () => {
    const now = new Date("2026-06-12T14:00:00.000Z")
    // Original slot: ENDED relative to now.
    expect(resolveJoinState(appt(), enabledClinic, configuredCfg, now).kind).toBe("ENDED")
    // Rescheduled to now's slot → OK, no token change involved.
    const moved = appt({
      scheduledAt: new Date("2026-06-12T14:00:00.000Z"),
      endAt: new Date("2026-06-12T14:50:00.000Z"),
    })
    expect(resolveJoinState(moved, enabledClinic, configuredCfg, now).kind).toBe("OK")
  })

  it("precedence: DISABLED > NOT_ONLINE > CANCELLED > ENDED > TOO_EARLY", () => {
    const early = new Date(SCHEDULED.getTime() - 60 * 60 * 1000)
    // DISABLED beats everything
    expect(
      resolveJoinState(
        appt({ type: "TAREFA", status: "CANCELADO_FALTA" }),
        { telehealthEnabled: false },
        configuredCfg,
        early
      ).kind
    ).toBe("DISABLED")
    // NOT_ONLINE beats CANCELLED
    expect(
      resolveJoinState(appt({ type: "TAREFA", status: "CANCELADO_FALTA" }), enabledClinic, configuredCfg, early).kind
    ).toBe("NOT_ONLINE")
    // CANCELLED beats ENDED
    expect(
      resolveJoinState(appt({ status: "CANCELADO_FALTA" }), enabledClinic, configuredCfg, new Date(END.getTime() + 60 * 60 * 1000)).kind
    ).toBe("CANCELLED")
    // ENDED beats TOO_EARLY (FINALIZADO before window)
    expect(
      resolveJoinState(appt({ status: "FINALIZADO" }), enabledClinic, configuredCfg, early).kind
    ).toBe("ENDED")
  })
})
