"use client"

interface NoteEditorFooterProps {
  busy: boolean
  hasContent: boolean
  locked: boolean
  onDelete: () => void
  onSign: () => void
  onReload: () => void
}

export function NoteEditorFooter({
  busy,
  hasContent,
  locked,
  onDelete,
  onSign,
  onReload,
}: NoteEditorFooterProps) {
  return (
    <footer className="flex items-center justify-between border-t border-border pt-4">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="h-9 rounded-md border border-input bg-background px-4 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        Excluir rascunho
      </button>
      {locked ? (
        <button
          type="button"
          onClick={onReload}
          className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
        >
          Recarregar
        </button>
      ) : (
        <button
          type="button"
          onClick={onSign}
          disabled={busy || !hasContent}
          className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Assinar
        </button>
      )}
    </footer>
  )
}
