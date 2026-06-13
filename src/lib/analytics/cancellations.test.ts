import { describe, it, expect } from "vitest"
import { cancellationBreakdown, cancellationHeatmap, type ApptStatusSlim } from "./cancellations"

// UTC instant for a local (UTC-3) wall clock.
function localUtc(y: number, mo: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h + 3))
}

describe("cancellationBreakdown", () => {
  it("counts each cancel status and the total", () => {
    const appts: ApptStatusSlim[] = [
      { status: "FINALIZADO", scheduledAt: localUtc(2026, 5, 4, 9) },
      { status: "CANCELADO_ACORDADO", scheduledAt: localUtc(2026, 5, 4, 10) },
      { status: "CANCELADO_FALTA", scheduledAt: localUtc(2026, 5, 4, 11) },
      { status: "CANCELADO_FALTA", scheduledAt: localUtc(2026, 5, 4, 12) },
      { status: "CANCELADO_PROFISSIONAL", scheduledAt: localUtc(2026, 5, 4, 13) },
    ]
    const b = cancellationBreakdown(appts)
    expect(b.total).toBe(5)
    expect(b.cancelled).toBe(4)
    expect(b.byStatus.CANCELADO_ACORDADO).toBe(1)
    expect(b.byStatus.CANCELADO_FALTA).toBe(2)
    expect(b.byStatus.CANCELADO_PROFISSIONAL).toBe(1)
    expect(b.rate).toBeCloseTo(0.8, 5)
  })

  it("returns zero rate for an empty list", () => {
    const b = cancellationBreakdown([])
    expect(b.total).toBe(0)
    expect(b.rate).toBe(0)
  })
})

describe("cancellationHeatmap", () => {
  it("returns a dense 7x17 grid", () => {
    const cells = cancellationHeatmap([])
    expect(cells).toHaveLength(7 * 17)
  })

  it("buckets cancellations by local day-of-week and hour", () => {
    // Monday 2026-05-04 at 10:00 local.
    const appts: ApptStatusSlim[] = [
      { status: "CANCELADO_FALTA", scheduledAt: localUtc(2026, 5, 4, 10) },
    ]
    const cells = cancellationHeatmap(appts)
    const cell = cells.find((c) => c.dayOfWeek === 1 && c.hour === 10)!
    expect(cell.total).toBe(1)
    expect(cell.byStatus.CANCELADO_FALTA).toBe(1)
  })

  it("ignores non-cancelled appointments", () => {
    const appts: ApptStatusSlim[] = [
      { status: "FINALIZADO", scheduledAt: localUtc(2026, 5, 4, 10) },
    ]
    const total = cancellationHeatmap(appts).reduce((acc, c) => acc + c.total, 0)
    expect(total).toBe(0)
  })

  it("clamps an early hour into the 06h bucket", () => {
    const appts: ApptStatusSlim[] = [
      { status: "CANCELADO_ACORDADO", scheduledAt: localUtc(2026, 5, 4, 3) },
    ]
    const cells = cancellationHeatmap(appts)
    const cell = cells.find((c) => c.dayOfWeek === 1 && c.hour === 6)!
    expect(cell.total).toBe(1)
  })

  it("clamps a late hour into the 22h bucket", () => {
    const appts: ApptStatusSlim[] = [
      { status: "CANCELADO_ACORDADO", scheduledAt: localUtc(2026, 5, 4, 23) },
    ]
    const cells = cancellationHeatmap(appts)
    const cell = cells.find((c) => c.dayOfWeek === 1 && c.hour === 22)!
    expect(cell.total).toBe(1)
  })
})
