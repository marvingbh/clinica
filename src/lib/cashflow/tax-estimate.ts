/**
 * Brazilian tax estimation based on clinic's tax regime.
 * Rates are from current legislation (2026).
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

// Lucro Presumido standard rates for healthcare services
const LUCRO_PRESUMIDO = {
  iss: 0.02, // 2-5% varies by municipality — use NfseConfig.aliquotaIss
  pis: 0.0065,
  cofins: 0.03,
  // IRPJ: 15% on presumed base (32% of revenue) = 4.8%
  irpj: 0.048,
  // CSLL: 9% on presumed base (32% of revenue) = 2.88%
  csll: 0.0288,
}

export interface TaxEstimate {
  regime: string
  grossRevenue: number
  totalTax: number
  effectiveRate: number
  breakdown: { name: string; amount: number; rate: number }[]
}

/**
 * Estimate monthly tax based on regime and revenue.
 *
 * @param regime - "1" (MEI), "2" (Simples Nacional), "3" (Lucro Presumido), "4" (Lucro Real)
 * @param monthlyRevenue - projected gross revenue for the month
 * @param rbt12 - last 12 months gross revenue (for Simples Nacional bracket)
 * @param issRate - ISS rate from NfseConfig.aliquotaIss (for Lucro Presumido)
 * @param meiDas - fixed monthly DAS for MEI (default R$75.90 for 2026)
 */
export function estimateTax(
  regime: string,
  monthlyRevenue: number,
  rbt12: number = 0,
  issRate: number = 0.05,
  meiDas: number = 75.90
): TaxEstimate {
  if (monthlyRevenue <= 0) {
    return { regime, grossRevenue: 0, totalTax: 0, effectiveRate: 0, breakdown: [] }
  }

  switch (regime) {
    case "1": // MEI
      return {
        regime: "MEI",
        grossRevenue: monthlyRevenue,
        totalTax: meiDas,
        effectiveRate: meiDas / monthlyRevenue,
        breakdown: [{ name: "DAS (fixo)", amount: meiDas, rate: meiDas / monthlyRevenue }],
      }

    case "2": // Simples Nacional
      return estimateSimplesNacional(monthlyRevenue, rbt12)

    case "3": // Lucro Presumido
      return estimateLucroPresumido(monthlyRevenue, issRate)

    case "4": // Lucro Real (simplified — use same as Lucro Presumido as approximation)
      return estimateLucroPresumido(monthlyRevenue, issRate)

    default:
      return { regime: "Desconhecido", grossRevenue: monthlyRevenue, totalTax: 0, effectiveRate: 0, breakdown: [] }
  }
}

function estimateSimplesNacional(monthlyRevenue: number, rbt12: number): TaxEstimate {
  // Find the bracket
  const bracket = SIMPLES_ANEXO_III.find((b) => rbt12 <= b.maxRevenue)
    ?? SIMPLES_ANEXO_III[SIMPLES_ANEXO_III.length - 1]

  // Effective rate = ((RBT12 × nominal rate) - deduction) / RBT12
  const effectiveRate = rbt12 > 0
    ? ((rbt12 * bracket.rate) - bracket.deduction) / rbt12
    : bracket.rate

  const totalTax = round2(monthlyRevenue * effectiveRate)

  return {
    regime: "Simples Nacional",
    grossRevenue: monthlyRevenue,
    totalTax,
    effectiveRate,
    breakdown: [
      { name: "DAS Simples Nacional", amount: totalTax, rate: effectiveRate },
    ],
  }
}

function estimateLucroPresumido(monthlyRevenue: number, issRate: number): TaxEstimate {
  const iss = round2(monthlyRevenue * issRate)
  const pis = round2(monthlyRevenue * LUCRO_PRESUMIDO.pis)
  const cofins = round2(monthlyRevenue * LUCRO_PRESUMIDO.cofins)
  const irpj = round2(monthlyRevenue * LUCRO_PRESUMIDO.irpj)
  const csll = round2(monthlyRevenue * LUCRO_PRESUMIDO.csll)
  const totalTax = round2(iss + pis + cofins + irpj + csll)

  return {
    regime: "Lucro Presumido",
    grossRevenue: monthlyRevenue,
    totalTax,
    effectiveRate: totalTax / monthlyRevenue,
    breakdown: [
      { name: "ISS", amount: iss, rate: issRate },
      { name: "PIS", amount: pis, rate: LUCRO_PRESUMIDO.pis },
      { name: "COFINS", amount: cofins, rate: LUCRO_PRESUMIDO.cofins },
      { name: "IRPJ", amount: irpj, rate: LUCRO_PRESUMIDO.irpj },
      { name: "CSLL", amount: csll, rate: LUCRO_PRESUMIDO.csll },
    ],
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
