import { SigningFlow } from "./components/SigningFlow"

export const metadata = {
  title: "Assinatura de documento",
}

export default async function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="min-h-screen bg-muted/30">
      <SigningFlow token={token} />
    </div>
  )
}
