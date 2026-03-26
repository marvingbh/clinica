import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { ofxParser, createCsvParser } from "@/lib/bank-statement-parser"
import { suggestCategory } from "@/lib/expense-matcher"
import type { NormalizedTransaction } from "@/lib/bank-statement-parser"
import type { StoredPattern } from "@/lib/expense-matcher"

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const formData = await req.formData()
    const raw = formData.get("file")
    if (!raw || typeof raw === "string") {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 })
    }
    const file = raw
    const format = formData.get("format") as string | null

    const allowedExtensions = [".ofx", ".csv", ".txt"]
    const fileName = file.name.toLowerCase()
    if (!allowedExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: "Tipo de arquivo não suportado. Use OFX ou CSV." }, { status: 400 })
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo muito grande (max 4MB)" }, { status: 400 })
    }

    const content = await file.text()
    let transactions: NormalizedTransaction[]

    try {
      if (format === "ofx" || file.name.toLowerCase().endsWith(".ofx")) {
        transactions = ofxParser.parse(content)
      } else {
        // CSV with default Brazilian format
        const csvParser = createCsvParser({
          dateColumn: 0,
          amountColumn: 1,
          descriptionColumn: 2,
        })
        transactions = csvParser.parse(content)
      }
    } catch {
      return NextResponse.json({ error: "Erro ao processar arquivo" }, { status: 400 })
    }

    // Filter to DEBIT only (expenses)
    const debits = transactions.filter((tx) => tx.type === "DEBIT")

    // Deduplicate against existing bank transactions
    const existingIds = await prisma.bankTransaction.findMany({
      where: { clinicId: user.clinicId },
      select: { externalId: true },
    })
    const existingSet = new Set(existingIds.map((t) => t.externalId))
    const newTransactions = debits.filter((tx) => !existingSet.has(tx.externalId))

    // Load patterns for suggestions
    const patterns = await prisma.expenseCategoryPattern.findMany({
      where: { clinicId: user.clinicId },
      include: { category: { select: { name: true } } },
    })

    const storedPatterns: StoredPattern[] = patterns.map((p) => ({
      normalizedDescription: p.normalizedDescription,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      supplierName: p.supplierName,
      matchCount: p.matchCount,
    }))

    const suggestions = newTransactions.map((tx) => ({
      transaction: tx,
      suggestion: suggestCategory(tx.description, storedPatterns),
    }))

    return NextResponse.json({
      transactions: newTransactions,
      suggestions,
      duplicatesSkipped: debits.length - newTransactions.length,
      totalParsed: transactions.length,
      creditsIgnored: transactions.length - debits.length,
    })
  }
)
