/* Matches `.panel`/`.panel-head`/`.panel-body` in dashboard.css.
   Lighter than Card (6px radius); primarily used for dashboard widgets
   with a title row + body area. */

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Panel({ className = "", children, ...props }: PanelProps) {
  return (
    <div
      className={`bg-card border border-ink-200 rounded-md ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function PanelHead({
  title,
  actions,
  className = "",
}: {
  title: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-ink-200 ${className}`}
    >
      <h3 className="m-0 text-sm font-semibold text-ink-900 leading-tight">
        {title}
      </h3>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  )
}

export function PanelBody({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}
