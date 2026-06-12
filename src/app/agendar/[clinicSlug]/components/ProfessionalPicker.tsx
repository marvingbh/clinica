import type { PublicProfessional } from "./types"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * Step 1: pick a professional. Cards with photo (or initials fallback), name,
 * specialty and a short bio.
 */
export function ProfessionalPicker({
  professionals,
  onSelect,
}: {
  professionals: PublicProfessional[]
  onSelect: (slug: string) => void
}) {
  if (professionals.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Nenhum profissional disponível para agendamento online no momento.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {professionals.map((p) => (
        <li key={p.slug}>
          <button
            type="button"
            onClick={() => onSelect(p.slug)}
            className="w-full flex items-center gap-4 text-left p-4 rounded-lg border border-border bg-card hover:border-primary/50 active:bg-muted transition-colors"
          >
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt={p.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                {initials(p.name)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block font-medium text-foreground truncate">{p.name}</span>
              {p.specialty && (
                <span className="block text-sm text-muted-foreground truncate">{p.specialty}</span>
              )}
              {p.bio && (
                <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.bio}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
