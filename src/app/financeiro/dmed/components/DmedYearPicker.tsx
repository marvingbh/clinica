"use client"

interface Props {
  year: number
  onChange: (year: number) => void
}

export function DmedYearPicker({ year, onChange }: Props) {
  const now = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => now - i)
  return (
    <select
      value={year}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
