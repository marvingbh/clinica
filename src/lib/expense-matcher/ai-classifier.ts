import Anthropic from "@anthropic-ai/sdk"
import { suggestCategory } from "./matcher"
import type { MatchSuggestion, StoredPattern } from "./types"

interface CategoryInfo {
  id: string
  name: string
}

interface AiClassificationResult {
  categoryId: string | null
  categoryName: string | null
  supplierName: string | null
  confidence: number
  explanation: string
  source: "ai" | "pattern"
}

/**
 * Classify a bank transaction description using Claude API.
 * Falls back to pattern matching if AI is unavailable or low confidence.
 */
export async function classifyTransaction(
  description: string,
  categories: CategoryInfo[],
  patterns: StoredPattern[],
  options?: { apiKey?: string; confidenceThreshold?: number }
): Promise<AiClassificationResult> {
  const threshold = options?.confidenceThreshold ?? 0.7

  // Try pattern matching first (free, fast)
  const patternMatch = suggestCategory(description, patterns)
  if (patternMatch && patternMatch.confidence === "HIGH") {
    return {
      categoryId: patternMatch.categoryId,
      categoryName: patternMatch.categoryName,
      supplierName: patternMatch.supplierName,
      confidence: 0.95,
      explanation: `Correspondência exata com padrão anterior (${patternMatch.matchCount} ocorrências)`,
      source: "pattern",
    }
  }

  // Try AI classification
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No API key — fall back to pattern match or unknown
    return patternMatch
      ? {
          categoryId: patternMatch.categoryId,
          categoryName: patternMatch.categoryName,
          supplierName: patternMatch.supplierName,
          confidence: patternMatch.confidence === "MEDIUM" ? 0.6 : 0.3,
          explanation: "Correspondência parcial com padrão anterior",
          source: "pattern",
        }
      : {
          categoryId: null,
          categoryName: null,
          supplierName: null,
          confidence: 0,
          explanation: "Sem correspondência encontrada e API de IA não configurada",
          source: "pattern",
        }
  }

  try {
    const client = new Anthropic({ apiKey })
    const categoryList = categories.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Classifique esta transação bancária de uma clínica de saúde no Brasil.

Descrição da transação: "${description}"

Categorias disponíveis:
${categoryList}

Responda em JSON com:
- categoryId: o ID da categoria mais adequada (ou null se nenhuma)
- categoryName: o nome da categoria escolhida
- supplierName: o nome do fornecedor/empresa identificado na descrição (ou null)
- confidence: número de 0 a 1 indicando confiança
- explanation: breve explicação da classificação em português

Apenas JSON, sem markdown.`,
        },
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const parsed = JSON.parse(text) as {
      categoryId: string | null
      categoryName: string | null
      supplierName: string | null
      confidence: number
      explanation: string
    }

    // If AI confidence is below threshold, prefer pattern match
    if (parsed.confidence < threshold && patternMatch) {
      return {
        categoryId: patternMatch.categoryId,
        categoryName: patternMatch.categoryName,
        supplierName: patternMatch.supplierName,
        confidence: patternMatch.confidence === "MEDIUM" ? 0.6 : 0.3,
        explanation: "IA com baixa confiança, usando padrão anterior",
        source: "pattern",
      }
    }

    return {
      ...parsed,
      source: "ai",
    }
  } catch {
    // AI failed — fall back to pattern match
    return patternMatch
      ? {
          categoryId: patternMatch.categoryId,
          categoryName: patternMatch.categoryName,
          supplierName: patternMatch.supplierName,
          confidence: patternMatch.confidence === "MEDIUM" ? 0.6 : 0.3,
          explanation: "Erro na API de IA, usando padrão anterior",
          source: "pattern",
        }
      : {
          categoryId: null,
          categoryName: null,
          supplierName: null,
          confidence: 0,
          explanation: "Erro na API de IA e sem padrão encontrado",
          source: "pattern",
        }
  }
}
