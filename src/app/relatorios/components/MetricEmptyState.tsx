import { Inbox } from "lucide-react"

/** Educational empty state for a report tab with no data in the period. */
export function MetricEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6 border border-dashed border-border rounded-lg bg-muted/30">
      <Inbox className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
