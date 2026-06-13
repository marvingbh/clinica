"use client"

interface PublishBarProps {
  hasUnpublishedChanges: boolean
  latestVersion: number | null
  saving: boolean
  publishing: boolean
  onSave: () => void
  onPublish: () => void
}

/** Sticky toolbar: save draft, publish, and the unpublished-changes badge. */
export function PublishBar({
  hasUnpublishedChanges,
  latestVersion,
  saving,
  publishing,
  onSave,
  onPublish,
}: PublishBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-ink-500">
        {latestVersion ? `Última versão: v${latestVersion}` : "Sem versão publicada"}
      </span>
      {hasUnpublishedChanges && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] text-amber-700">
          Alterações não publicadas
        </span>
      )}
      <div className="ml-auto flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar rascunho"}
        </button>
        <button
          onClick={onPublish}
          disabled={publishing}
          className="rounded-lg bg-ink-900 text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {publishing ? "Publicando..." : "Publicar"}
        </button>
      </div>
    </div>
  )
}
