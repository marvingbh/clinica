/**
 * Look up the IBGE municipality code from a CEP using ViaCEP.
 * Returns the 7-digit IBGE code, or null if lookup fails.
 */
export async function lookupIbgeFromCep(cep: string): Promise<string | null> {
  const cleanCep = cep.replace(/\D/g, "")
  if (cleanCep.length !== 8) return null

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    return data.ibge || null
  } catch {
    return null
  }
}
