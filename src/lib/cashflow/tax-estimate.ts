/**
 * Brazilian tax estimation based on clinic's tax regime.
 * Rates are from current legislation (2026).
 *
 * Lucro Presumido periodicity:
 * - PIS + COFINS + ISS → MONTHLY
 * - IRPJ + CSLL → QUARTERLY (due in Apr, Jul, Oct, Jan for previous quarter)
 */

// Simples Nacional Anexo III (services) — brackets by RBT12 (last 12 months gross revenue)
const SIMPLES_ANEXO_III = [
  { maxRevenue: 180_000, rate: 0.06, deduction: 0 },
  { maxRevenue: 360_000, rate: 0.112, deduction: 9_360 },
  { maxRevenue: 720_000, rate: 0.135, deduction: 17_640 },
  { maxRevenue: 1_800_000, rate: 0.16, deduction: 35_640 },
  { maxRevenue: 3_600_000, rate: 0.21, deduction: 125_640 },
  { maxRevenue: 4_800_000, rate: 0.33, deduction: 648_000 },
]

// Lucro Presumido rates for healthcare services
const LP_RATES = {
  pis: 0.0065,      // Monthly
  cofins: 0.03,     // Monthly
  // IRPJ/CSLL are on presumed base (32% of revenue for services)
  presumedBase: 0.32,
  irpj: 0.15,       // Quarterly — 15% on presumed base
  irpjAdditional: 0.10, // 10% on quarterly presumed profit > R$60k
  irpjAdditionalThreshold: 60_000, // per quarter
  csll: 0.09,       // Quarterly — 9% on presumed base
}

// Months where quarterly IRPJ/CSLL is due (payment month for previous quarter)
// Q1 (Jan-Mar) → due April (4), Q2 (Apr-Jun) → due July (7),
// Q3 (Jul-Sep) → due October (10), Q4 (Oct-Dec) → due January (1)
const QUARTERLY_DUE_MONTHS = [1, 4, 7, 10]

export interface TaxEstimate {
  regime: string
  grossRevenue: number
  totalTax: number
  effectiveRate: number
  breakdown: { name: string; amount: number; rate: number; period: "mensal" | "trimestral" }[]
  monthlyTotal: number
  quarterlyTotal: number
  quarterlyDueThisMonth: boolean
  nextQuarterlyDueMonth?: number // e.g., 7 for July
}

/**
 * Estimate tax for a specific month, respecting monthly vs quarterly periodicity.
 *
 * @param regime - "1" (MEI), "2" (Simples Nacional), "3" (Lucro Presumido), "4" (Lucro Real)
 * @param monthlyRevenue - projected gross revenue for this month
 * @param month - 1-12, the month being projected (determines if quarterly taxes are due)
 * @param quarterRevenue - estimated total revenue for the quarter (for IRPJ/CSLL base). If not provided, uses monthlyRevenue × 3.
 * @param rbt12 - last 12 months gross revenue (for Simples Nacional bracket)
 * @param issRate - ISS rate from NfseConfig.aliquotaIss
 * @param meiDas - fixed monthly DAS for MEI
 */
export function estimateTax(
  regime: string,
  monthlyRevenue: number,
  month: number = 1,
  quarterRevenue?: number,
  rbt12: number = 0,
  issRate: number = 0.05,
  meiDas: number = 75.90
): TaxEstimate {
  if (monthlyRevenue <= 0) {
    return { regime, grossRevenue: 0, totalTax: 0, effectiveRate: 0, breakdown: [], monthlyTotal: 0, quarterlyTotal: 0, quarterlyDueThisMonth: false }
  }

  switch (regime) {
    case "1": // MEI — always monthly
      return {
        regime: "MEI",
        grossRevenue: monthlyRevenue,
        totalTax: meiDas,
        effectiveRate: meiDas / monthlyRevenue,
        breakdown: [{ name: "DAS (fixo)", amount: meiDas, rate: meiDas / monthlyRevenue, period: "mensal" }],
        monthlyTotal: meiDas,
        quarterlyTotal: 0,
        quarterlyDueThisMonth: false,
      }

    case "2": // Simples Nacional — always monthly
      return estimateSimplesNacional(monthlyRevenue, rbt12)

    case "3": // Lucro Presumido — monthly + quarterly
    case "4": // Lucro Real (approximation)
      return estimateLucroPresumido(monthlyRevenue, month, quarterRevenue, issRate)

    default:
      return { regime: "Desconhecido", grossRevenue: monthlyRevenue, totalTax: 0, effectiveRate: 0, breakdown: [], monthlyTotal: 0, quarterlyTotal: 0, quarterlyDueThisMonth: false }
  }
}

function estimateSimplesNacional(monthlyRevenue: number, rbt12: number): TaxEstimate {
  const bracket = SIMPLES_ANEXO_III.find((b) => rbt12 <= b.maxRevenue)
    ?? SIMPLES_ANEXO_III[SIMPLES_ANEXO_III.length - 1]

  const effectiveRate = rbt12 > 0
    ? ((rbt12 * bracket.rate) - bracket.deduction) / rbt12
    : bracket.rate

  const totalTax = round2(monthlyRevenue * effectiveRate)

  return {
    regime: "Simples Nacional",
    grossRevenue: monthlyRevenue,
    totalTax,
    effectiveRate,
    breakdown: [{ name: "DAS Simples Nacional", amount: totalTax, rate: effectiveRate, period: "mensal" }],
    monthlyTotal: totalTax,
    quarterlyTotal: 0,
    quarterlyDueThisMonth: false,
  }
}

function estimateLucroPresumido(
  monthlyRevenue: number,
  month: number,
  quarterRevenue?: number,
  issRate: number = 0.05
): TaxEstimate {
  // Monthly taxes: ISS + PIS + COFINS
  const iss = round2(monthlyRevenue * issRate)
  const pis = round2(monthlyRevenue * LP_RATES.pis)
  const cofins = round2(monthlyRevenue * LP_RATES.cofins)
  const monthlyTotal = round2(iss + pis + cofins)

  const breakdown: TaxEstimate["breakdown"] = [
    { name: "ISS", amount: iss, rate: issRate, period: "mensal" },
    { name: "PIS", amount: pis, rate: LP_RATES.pis, period: "mensal" },
    { name: "COFINS", amount: cofins, rate: LP_RATES.cofins, period: "mensal" },
  ]

  // Quarterly taxes: IRPJ + CSLL (due in Apr, Jul, Oct, Jan)
  const quarterlyDueThisMonth = QUARTERLY_DUE_MONTHS.includes(month)
  let quarterlyTotal = 0

  if (quarterlyDueThisMonth) {
    const qRevenue = quarterRevenue ?? monthlyRevenue * 3
    const presumedProfit = round2(qRevenue * LP_RATES.presumedBase)

    // IRPJ: 15% on presumed base + 10% additional on excess over R$60k
    let irpj = round2(presumedProfit * LP_RATES.irpj)
    if (presumedProfit > LP_RATES.irpjAdditionalThreshold) {
      irpj += round2((presumedProfit - LP_RATES.irpjAdditionalThreshold) * LP_RATES.irpjAdditional)
    }

    // CSLL: 9% on presumed base
    const csll = round2(presumedProfit * LP_RATES.csll)

    quarterlyTotal = round2(irpj + csll)
    breakdown.push(
      { name: "IRPJ (trimestral)", amount: irpj, rate: irpj / qRevenue, period: "trimestral" },
      { name: "CSLL (trimestral)", amount: csll, rate: csll / qRevenue, period: "trimestral" },
    )
  }

  const totalTax = round2(monthlyTotal + quarterlyTotal)

  // Next quarterly due month (for display when not due this month)
  let nextQuarterlyDueMonth: number | undefined
  if (!quarterlyDueThisMonth) {
    nextQuarterlyDueMonth = QUARTERLY_DUE_MONTHS.find((m) => m > month) ?? QUARTERLY_DUE_MONTHS[0]
  }

  return {
    regime: "Lucro Presumido",
    grossRevenue: monthlyRevenue,
    totalTax,
    effectiveRate: totalTax / monthlyRevenue,
    breakdown,
    monthlyTotal,
    quarterlyTotal,
    quarterlyDueThisMonth,
    nextQuarterlyDueMonth,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
