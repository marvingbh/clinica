import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma
const mockAuditLogCreate = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) },
  },
}))

import {
  AuditAction,
  createAuditLog,
  logPermissionDenied,
  audit,
  logAuthEvent,
} from "./audit"
import type { AuthUser } from "./types"

// --- Helpers ---

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    clinicId: "clinic-1",
    role: "ADMIN",
    professionalProfileId: "prof-1",
    permissions: {} as AuthUser["permissions"],
    ...overrides,
  }
}

function makeRequestWithHeaders(
  headers: Record<string, string> = {}
): Request {
  return {
    headers: new Headers(headers),
  } as unknown as Request
}

describe("AuditAction constants", () => {
  it("contains expected appointment actions", () => {
    expect(AuditAction.APPOINTMENT_CREATED).toBe("APPOINTMENT_CREATED")
    expect(AuditAction.APPOINTMENT_UPDATED).toBe("APPOINTMENT_UPDATED")
    expect(AuditAction.APPOINTMENT_DELETED).toBe("APPOINTMENT_DELETED")
    expect(AuditAction.APPOINTMENT_STATUS_CHANGED).toBe("APPOINTMENT_STATUS_CHANGED")
    expect(AuditAction.APPOINTMENT_CANCELLED).toBe("APPOINTMENT_CANCELLED")
  })

  it("contains expected patient actions", () => {
    expect(AuditAction.PATIENT_CREATED).toBe("PATIENT_CREATED")
    expect(AuditAction.PATIENT_UPDATED).toBe("PATIENT_UPDATED")
    expect(AuditAction.PATIENT_DELETED).toBe("PATIENT_DELETED")
  })

  it("contains auth and permission actions", () => {
    expect(AuditAction.LOGIN_SUCCESS).toBe("LOGIN_SUCCESS")
    expect(AuditAction.LOGIN_FAILED).toBe("LOGIN_FAILED")
    expect(AuditAction.PERMISSION_DENIED).toBe("PERMISSION_DENIED")
  })

  it("contains invoice actions", () => {
    expect(AuditAction.INVOICE_STATUS_CHANGED).toBe("INVOICE_STATUS_CHANGED")
    expect(AuditAction.INVOICE_DELETED).toBe("INVOICE_DELETED")
    expect(AuditAction.INVOICE_SENT).toBe("INVOICE_SENT")
  })

  it("contains expense actions", () => {
    expect(AuditAction.EXPENSE_CREATED).toBe("EXPENSE_CREATED")
    expect(AuditAction.EXPENSE_UPDATED).toBe("EXPENSE_UPDATED")
    expect(AuditAction.EXPENSE_DELETED).toBe("EXPENSE_DELETED")
    expect(AuditAction.EXPENSE_STATUS_CHANGED).toBe("EXPENSE_STATUS_CHANGED")
  })
})

describe("createAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates an audit log entry with all fields", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await createAuditLog({
      user: makeUser(),
      action: AuditAction.PATIENT_CREATED,
      entityType: "Patient",
      entityId: "patient-1",
      oldValues: undefined,
      newValues: { name: "John" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        clinicId: "clinic-1",
        userId: "user-1",
        action: "PATIENT_CREATED",
        entityType: "Patient",
        entityId: "patient-1",
        oldValues: undefined,
        newValues: { name: "John" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      },
    })
  })

  it("stores null for missing ipAddress and userAgent", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await createAuditLog({
      user: makeUser(),
      action: AuditAction.PATIENT_UPDATED,
      entityType: "Patient",
      entityId: "patient-1",
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: null,
        userAgent: null,
      }),
    })
  })
})

describe("logPermissionDenied", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a PERMISSION_DENIED audit entry with attempted action details", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await logPermissionDenied(
      makeUser({ role: "PROFESSIONAL" }),
      "user",
      "create",
      "user-99",
      "Role PROFESSIONAL cannot create user"
    )

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PERMISSION_DENIED",
        entityType: "user",
        entityId: "user-99",
        newValues: {
          attemptedAction: "create",
          reason: "Role PROFESSIONAL cannot create user",
        },
      }),
    })
  })

  it("defaults entityId to 'unknown' when resourceId is empty", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await logPermissionDenied(
      makeUser(),
      "appointment",
      "delete",
      "",
      "Access denied"
    )

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "unknown",
      }),
    })
  })

  it("extracts IP and user-agent from request headers", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    const request = makeRequestWithHeaders({
      "x-forwarded-for": "10.0.0.1",
      "user-agent": "TestBot/1.0",
    })

    await logPermissionDenied(
      makeUser(),
      "patient",
      "delete",
      "patient-1",
      "Forbidden",
      request
    )

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "10.0.0.1",
        userAgent: "TestBot/1.0",
      }),
    })
  })
})

describe("audit.log", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates an audit entry with request metadata extracted", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    const request = makeRequestWithHeaders({
      "x-real-ip": "172.16.0.5",
      "user-agent": "Chrome/120",
    })

    await audit.log({
      user: makeUser(),
      action: AuditAction.APPOINTMENT_CREATED,
      entityType: "Appointment",
      entityId: "appt-1",
      newValues: { date: "2026-04-14" },
      request,
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "APPOINTMENT_CREATED",
        entityType: "Appointment",
        entityId: "appt-1",
        newValues: { date: "2026-04-14" },
        ipAddress: "172.16.0.5",
        userAgent: "Chrome/120",
      }),
    })
  })

  it("works without a request object (no IP or user-agent)", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await audit.log({
      user: makeUser(),
      action: AuditAction.INVOICE_DELETED,
      entityType: "Invoice",
      entityId: "inv-1",
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: null,
        userAgent: null,
      }),
    })
  })
})

describe("logAuthEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("logs a successful login event", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await logAuthEvent({
      clinicId: "clinic-1",
      userId: "user-1",
      action: AuditAction.LOGIN_SUCCESS,
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clinicId: "clinic-1",
        userId: "user-1",
        action: "LOGIN_SUCCESS",
        entityType: "User",
        entityId: "user-1",
      }),
    })
  })

  it("logs a failed login with unknown entityId when userId is missing", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    await logAuthEvent({
      clinicId: "clinic-1",
      action: AuditAction.LOGIN_FAILED,
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        action: "LOGIN_FAILED",
        entityId: "unknown",
      }),
    })
  })

  it("includes metadata and request headers when provided — no plaintext email", async () => {
    mockAuditLogCreate.mockResolvedValue({})

    const request = makeRequestWithHeaders({
      "x-forwarded-for": "203.0.113.42",
      "user-agent": "Safari/17",
    })

    await logAuthEvent({
      clinicId: "clinic-1",
      userId: "user-1",
      action: AuditAction.LOGIN_SUCCESS,
      request,
      metadata: { method: "credentials", emailHash: "abc123" },
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "203.0.113.42",
        userAgent: "Safari/17",
        newValues: {
          method: "credentials",
          emailHash: "abc123",
        },
      }),
    })
  })
})
