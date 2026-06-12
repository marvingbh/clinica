"use client"

interface NoteSectionFieldProps {
  label: string
  helpText?: string
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  /** Optional inline element rendered next to the label (e.g. AI review tag). */
  adornment?: React.ReactNode
}

export function NoteSectionField({ label, helpText, value, readOnly, onChange, adornment }: NoteSectionFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {adornment}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
          readOnly ? "cursor-default opacity-90" : ""
        }`}
      />
    </div>
  )
}
