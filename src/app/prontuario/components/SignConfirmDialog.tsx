"use client"

interface SignConfirmDialogProps {
  open: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function SignConfirmDialog({ open, busy, onConfirm, onCancel }: SignConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground">Assinar nota</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Ao assinar, esta nota se tornará imutável e não poderá mais ser editada ou excluída.
          Correções posteriores deverão ser feitas por adendo. Deseja assinar?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-md border border-input bg-background px-4 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Assinar nota
          </button>
        </div>
      </div>
    </div>
  )
}
