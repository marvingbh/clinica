"use client"

interface Props {
  count: number
  busy: boolean
  onFinalize: () => void
  onMarkNoShow: () => void
  onCancel: () => void
  onClear: () => void
}

export function PendenciasBulkBar({
  count,
  busy,
  onFinalize,
  onMarkNoShow,
  onCancel,
  onClear,
}: Props) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-ink-900 text-white rounded-t-[12px]">
      <span className="text-[13px] font-semibold">
        {count} selecionada{count > 1 ? "s" : ""}
      </span>
      <button
        onClick={onClear}
        disabled={busy}
        className="text-[12px] text-white/70 underline hover:text-white disabled:opacity-50"
      >
        limpar
      </button>
      <div className="flex-1" />
      <Btn onClick={onFinalize} busy={busy}>
        Finalizar
      </Btn>
      <Btn onClick={onMarkNoShow} busy={busy}>
        Faltou
      </Btn>
      <Btn onClick={onCancel} busy={busy} danger>
        Cancelar
      </Btn>
    </div>
  )
}

function Btn({
  onClick,
  busy,
  danger,
  children,
}: {
  onClick: () => void
  busy: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-2.5 py-1 rounded-[6px] text-[12px] border transition-colors disabled:opacity-50 ${
        danger
          ? "border-rose-300/60 text-rose-200 hover:bg-rose-500/15"
          : "border-white/30 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  )
}
