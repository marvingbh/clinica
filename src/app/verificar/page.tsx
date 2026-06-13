import { VerifyCodeForm } from "./VerifyCodeForm"

export const metadata = { title: "Verificar autenticidade de documento" }

export default function VerificarPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-10 space-y-4">
        <h1 className="text-lg font-semibold">Verificar autenticidade de documento</h1>
        <p className="text-sm text-muted-foreground">
          Informe o código de verificação impresso na página de assinaturas do documento.
        </p>
        <VerifyCodeForm />
      </div>
    </div>
  )
}
