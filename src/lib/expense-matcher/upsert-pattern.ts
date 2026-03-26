import { normalizeDescription } from "./normalize"

// Minimal interface for a Prisma client or transaction client that has expenseCategoryPattern.upsert
interface PrismaLike {
  expenseCategoryPattern: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: (args: any) => Promise<any>
  }
}

/**
 * Upsert an expense category pattern for future auto-matching.
 * Shared across all routes that learn patterns from user categorization.
 */
export async function upsertCategoryPattern(
  tx: PrismaLike,
  clinicId: string,
  description: string,
  categoryId: string | null | undefined,
  supplierName: string | null | undefined,
  recurrenceId?: string | null
) {
  const normalized = normalizeDescription(description)
  if (!normalized) return
  await tx.expenseCategoryPattern.upsert({
    where: {
      clinicId_normalizedDescription: {
        clinicId,
        normalizedDescription: normalized,
      },
    },
    update: {
      ...(categoryId !== undefined && { categoryId }),
      ...(supplierName !== undefined && { supplierName }),
      ...(recurrenceId !== undefined && { recurrenceId }),
      matchCount: { increment: 1 },
    },
    create: {
      clinicId,
      normalizedDescription: normalized,
      categoryId: categoryId ?? null,
      supplierName: supplierName ?? null,
      ...(recurrenceId !== undefined && { recurrenceId }),
      matchCount: 1,
    },
  })
}
