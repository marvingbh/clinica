import { VerificationResult } from "./VerificationResult"

export const metadata = { title: "Resultado da verificação" }

export default async function VerificarCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-10">
        <VerificationResult code={code} />
      </div>
    </div>
  )
}
