"use client"

interface TimelineEntry {
  signerId: string
  signerName: string
  lines: string[]
}

export function SignatureEvidenceTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  if (!timeline || timeline.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Sem eventos registrados.</p>
  }
  return (
    <div className="space-y-4">
      {timeline.map((entry) => (
        <div key={entry.signerId} className="rounded-md border border-input p-3">
          <p className="text-sm font-medium mb-1">{entry.signerName}</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {entry.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
