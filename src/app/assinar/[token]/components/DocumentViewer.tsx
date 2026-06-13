"use client"

interface Props {
  token: string
}

/** Renders the original PDF inline with a download fallback for mobile. */
export function DocumentViewer({ token }: Props) {
  const url = `/api/public/assinaturas/${token}/pdf`
  return (
    <div className="space-y-2">
      <iframe src={url} title="Documento" className="w-full h-[55vh] rounded-md border bg-white" />
      <a href={url} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-700 hover:text-blue-900">
        Não consegue ver o documento? Baixar para ler
      </a>
    </div>
  )
}
