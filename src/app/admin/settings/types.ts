export interface ClinicSettings {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  defaultSessionDuration: number
  minAdvanceBooking: number
  reminderHours: number[]
  invoiceDueDay: number
  invoiceMessageTemplate: string | null
  paymentInfo: string | null
  emailSenderName: string | null
  emailFromAddress: string | null
  emailBcc: string | null
  billingMode: "PER_SESSION" | "MONTHLY_FIXED"
  invoiceGrouping: "MONTHLY" | "PER_SESSION"
  taxPercentage: number
  hasLogo: boolean
}

export interface TabProps {
  settings: ClinicSettings
  onUpdate: (settings: ClinicSettings) => void
}

export async function patchSettings(body: Record<string, unknown>): Promise<ClinicSettings> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || "Erro ao salvar")
  }
  const data = await res.json()
  return data.settings
}
