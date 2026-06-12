export interface TermoDescarteData {
  clinicName: string
  patientName: string
  recordClosedAt: Date
  retentionYears: number
  disposedAt: Date
  disposedByName: string
  notesCount: number
  addendaCount: number
  oldestSessionDate: Date | null
  newestSessionDate: Date | null
  contentHashes: string[]
}

/** Assemble the disposal-term data structure from raw inputs. */
export function buildTermoDescarteData(input: TermoDescarteData): TermoDescarteData {
  return { ...input }
}

function formatBrDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0")
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const y = date.getUTCFullYear()
  return `${d}/${m}/${y}`
}

/**
 * Build the pt-BR paragraphs of the formal disposal term (Termo de Descarte),
 * citing the governing CFP resolution and federal law.
 */
export function formatTermoDescarteLines(data: TermoDescarteData): string[] {
  const lines: string[] = []
  lines.push("TERMO DE DESCARTE DE PRONTUÁRIO")
  lines.push("")
  lines.push(
    `A clínica ${data.clinicName} declara, para os devidos fins, que realizou o descarte formal dos registros clínicos (prontuário) do(a) paciente ${data.patientName} em ${formatBrDate(data.disposedAt)}.`
  )
  lines.push(
    `O prontuário foi encerrado em ${formatBrDate(data.recordClosedAt)} e cumpriu o prazo de guarda obrigatória de ${data.retentionYears} anos.`
  )
  lines.push(
    "O descarte observa a Resolução CFP nº 01/2009 (registro documental e guarda mínima de 5 anos) e a Lei nº 13.787/2018 (prontuário eletrônico e eliminação após o prazo de guarda)."
  )
  lines.push(
    `Foram eliminados ${data.notesCount} ${data.notesCount === 1 ? "registro clínico" : "registros clínicos"} e ${data.addendaCount} ${data.addendaCount === 1 ? "adendo" : "adendos"}.`
  )
  if (data.oldestSessionDate && data.newestSessionDate) {
    lines.push(
      `As sessões registradas abrangem o período de ${formatBrDate(data.oldestSessionDate)} a ${formatBrDate(data.newestSessionDate)}.`
    )
  }
  lines.push(
    `Descarte autorizado e executado por ${data.disposedByName}.`
  )
  if (data.contentHashes.length > 0) {
    lines.push("")
    lines.push("Códigos de integridade (SHA-256) das notas assinadas descartadas:")
    for (const hash of data.contentHashes) {
      lines.push(hash)
    }
  }
  return lines
}
