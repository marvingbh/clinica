/** Shared Prisma include for invoice PDF generation (used by single PDF and bulk zip). */
export const INVOICE_INCLUDE = {
  clinic: { select: { name: true, phone: true, email: true, address: true, paymentInfo: true, logoData: true, logoMime: true } },
  patient: { select: { id: true, name: true } },
  professionalProfile: { select: { id: true, user: { select: { name: true } } } },
  items: {
    orderBy: { createdAt: "asc" as const },
    include: { appointment: { select: { scheduledAt: true } } },
  },
}
