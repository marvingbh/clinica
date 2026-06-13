"use client"

import { CheckCircle2, Download } from "lucide-react"

interface Props {
  verificationCode: string | null
  downloadUrl: string | null
}

export function SignedSuccess({ verificationCode, downloadUrl }: Props) {
  return (
    <div className="text-center space-y-4 py-6">
      <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
      <h2 className="text-lg font-semibold">Documento assinado com sucesso!</h2>
      {verificationCode && (
        <p className="text-sm text-muted-foreground">
          Código de verificação: <span className="font-mono font-medium text-foreground">{verificationCode}</span>
        </p>
      )}
      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-11 px-4 rounded-md bg-primary text-primary-foreground font-medium">
          <Download className="h-4 w-4" /> Baixar via assinada (PDF)
        </a>
      )}
    </div>
  )
}
