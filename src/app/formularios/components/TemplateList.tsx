"use client"

export interface TemplateSummary {
  id: string
  name: string
  description: string | null
  isActive: boolean
  autoSendOnIntakeApproval: boolean
  latestVersion: number | null
  versionCount: number
  hasUnpublishedChanges: boolean
  responseCounts: { total: number; concluidos: number }
}

interface TemplateListProps {
  templates: TemplateSummary[] | null
  onOpen: (id: string) => void
}

/** Table of form templates with status, version and response counts. */
export function TemplateList({ templates, onOpen }: TemplateListProps) {
  if (templates === null) {
    return <p className="text-[14px] text-ink-500">Carregando...</p>
  }
  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 p-10 text-center">
        <p className="text-[14px] text-ink-600">Nenhum formulário ainda.</p>
        <p className="text-[13px] text-ink-400 mt-1">
          Crie um do zero ou adicione os modelos prontos.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-ink-100 overflow-hidden">
      <table className="w-full text-[14px]">
        <thead className="bg-ink-50 text-ink-500 text-[12px] uppercase tracking-wide">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Nome</th>
            <th className="text-left font-medium px-4 py-2.5">Status</th>
            <th className="text-left font-medium px-4 py-2.5">Versão</th>
            <th className="text-left font-medium px-4 py-2.5">Respostas</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="border-t border-ink-100 hover:bg-ink-50/50 cursor-pointer"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-ink-900">{t.name}</div>
                {t.description ? <div className="text-[12px] text-ink-500">{t.description}</div> : null}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[12px] ${
                    t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {t.isActive ? "Ativo" : "Inativo"}
                </span>
                {t.hasUnpublishedChanges && (
                  <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[12px] text-amber-700">
                    Alterações não publicadas
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-ink-700">
                {t.latestVersion ? `v${t.latestVersion}` : "—"}
              </td>
              <td className="px-4 py-3 text-ink-700">
                {t.responseCounts.concluidos}/{t.responseCounts.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
