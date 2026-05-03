"use client"

interface Props {
  count: number
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onClear: () => void
}

export function TodoBulkBar({ count, onComplete, onUncomplete, onDelete, onClear }: Props) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-ink-900 text-white rounded-t-[12px]">
      <span className="text-[13px] font-semibold">
        {count} selecionada{count > 1 ? "s" : ""}
      </span>
      <button
        onClick={onClear}
        className="text-[12px] text-white/70 underline hover:text-white"
      >
        limpar
      </button>
      <div className="flex-1" />
      <BulkBtn onClick={onComplete}>Concluir</BulkBtn>
      <BulkBtn onClick={onUncomplete}>Reabrir</BulkBtn>
      <BulkBtn onClick={onDelete} danger>
        Excluir
      </BulkBtn>
    </div>
  )
}

function BulkBtn({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-[6px] text-[12px] border transition-colors ${
        danger
          ? "border-rose-300/60 text-rose-200 hover:bg-rose-500/15"
          : "border-white/30 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  )
}
