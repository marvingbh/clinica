// Force Brazil timezone for consistent date parsing on Vercel serverless functions.
// Without this, new Date("...T09:15:00") is parsed as UTC (3 hours behind BRT).
process.env.TZ = "America/Sao_Paulo"

export async function register() {
  // Instrumentation hook — TZ is set at module load time above
}
